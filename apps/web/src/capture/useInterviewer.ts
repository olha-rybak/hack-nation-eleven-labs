import { Conversation, type Mode } from '@elevenlabs/client'
import { useEffect, useRef, useState } from 'react'
import type { OffRecordRemoved, ScreenEvent } from '../types/session'
import { AnswerPairer } from './answers'
import { SpeechTracker } from './speech'

// The voice side of a live capture, same contract as the server's interviewer test page:
//   screen events      -> sendContextualUpdate (silent background context)
//   ask_now from server -> sendUserMessage("ASK_NOW" + subject + Known list), the agent asks one question
//   what is said       -> POST /sessions/:id/transcript, agent mode -> POST /sessions/:id/signals
//   expert voice (VAD) -> POST /sessions/:id/signals {user_speaking}, so no question lands mid-sentence
//   question + answer  -> POST /knowledge/answers, so the next session doesn't ask it again
//   off_the_record     -> client tool calling the same feed.offTheRecord as the panel button
//   paused             -> mic muted, no transcript/answers/VAD posts (nothing from voice while paused)

const VAD_THRESHOLD = Number(import.meta.env.VITE_VAD_SPEECH_THRESHOLD) || 0.5
const VAD_RELEASE_MS = Number(import.meta.env.VITE_VAD_RELEASE_MS) || 400

export type InterviewerStatus = 'off' | 'connecting' | 'listening' | 'speaking' | 'error'

interface AskNow {
  subject: string
  event_id: string
  guardrail?: boolean
  known?: { text: string }[]
}

type ServerMessage =
  | { type: 'snapshot'; data: { events: ScreenEvent[] } }
  | { type: 'event'; data: ScreenEvent }
  | { type: 'ask_now'; data: AskNow }
  | { type: string; data: unknown }

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// The line format the agent's system prompt describes: [mm:ss] kind entity · field: before → after
function eventLine(e: ScreenEvent): string {
  let line = `[${clock(e.ts_ms)}] ${e.kind} ${e.entity}`
  if (e.field) {
    line += ` · ${e.field}`
    if (e.before != null || e.after != null) line += `: ${e.before || '—'} → ${e.after || '—'}`
  }
  return line
}

// The format the agent's system prompt describes: cue, what to ask about, then what is already known.
export function askText(ask: AskNow): string {
  let text = `ASK_NOW\nSubject: ${ask.subject}`
  if (ask.guardrail) text += '\nGuardrail question'
  const known = ask.known ?? []
  if (known.length) text += `\nKnown:\n${known.map((k) => `- ${k.text}`).join('\n')}`
  return text
}

function post(path: string, body: unknown) {
  void fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export function useInterviewer(
  sessionId: string | null,
  startedAt: number | null,
  opts: { paused?: boolean; onOffTheRecord?: () => Promise<OffRecordRemoved> } = {},
) {
  const [status, setStatus] = useState<InterviewerStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const conversationRef = useRef<Conversation | null>(null)
  const pausedRef = useRef(Boolean(opts.paused))
  const onOffTheRecordRef = useRef(opts.onOffTheRecord)

  // Keep latest opts without reconnecting the conversation (deps stay [sessionId, startedAt]).
  useEffect(() => {
    pausedRef.current = Boolean(opts.paused)
    onOffTheRecordRef.current = opts.onOffTheRecord
  })

  useEffect(() => {
    if (!sessionId || startedAt == null) return
    const sid = encodeURIComponent(sessionId)
    let conversation: Conversation | null = null
    let socket: WebSocket | null = null
    let closed = false
    const sentEvents = new Set<string>()
    const pairer = new AnswerPairer()
    const speech = new SpeechTracker(VAD_THRESHOLD, VAD_RELEASE_MS)
    const userSpeaking = (speaking: boolean | null) => {
      if (pausedRef.current) return
      if (speaking !== null) post(`/sessions/${sid}/signals`, { user_speaking: speaking })
    }
    const release = setInterval(() => userSpeaking(speech.expire(performance.now())), 200)

    const forward = (e: ScreenEvent) => {
      if (sentEvents.has(e.id)) return
      sentEvents.add(e.id)
      conversation?.sendContextualUpdate(`Screen event: ${eventLine(e)}`)
    }

    async function connect() {
      setStatus('connecting')
      setError(null)
      try {
        const config = (await (await fetch('/api/config')).json()) as { agent_id: string }
        if (!config.agent_id) throw new Error('ELEVENLABS_INTERVIEWER_AGENT_ID is not set in .env')
        const conv = await Conversation.startSession({
          agentId: config.agent_id,
          connectionType: 'webrtc',
          clientTools: {
            off_the_record: async () => {
              if (pausedRef.current) return 'Recording is paused; nothing is being recorded.'
              const handler = onOffTheRecordRef.current
              if (!handler) return 'Off the record failed: no handler. Nothing was removed.'
              try {
                const removed = await handler()
                return (
                  `Removed the last stretch: ${removed.deleted_event_ids.length} events, ` +
                  `${removed.transcript} transcript lines, ${removed.frames} frames. Deleted from disk.`
                )
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                return `Off the record failed: ${message}. Nothing was removed.`
              }
            },
          },
          onModeChange: ({ mode }: { mode: Mode }) => {
            setStatus(mode)
            post(`/sessions/${sid}/signals`, { agent_speaking: mode === 'speaking' })
          },
          onVadScore: ({ vadScore }: { vadScore: number }) => {
            if (pausedRef.current) return
            userSpeaking(speech.score(vadScore, performance.now()))
          },
          onMessage: ({ message, role }) => {
            if (pausedRef.current) return
            const speaker = role === 'agent' ? 'agent' : 'expert'
            post(`/sessions/${sid}/transcript`, { speaker, text: message, ts_ms: Math.round(performance.now() - startedAt!) })
            if (role === 'agent') pairer.agent(message)
            else {
              const answer = pairer.expert(message)
              if (answer) post('/knowledge/answers', { session_id: sessionId, ...answer })
            }
          },
          onDisconnect: () => {
            if (!closed) setStatus('off')
          },
          onError: (message: string) => {
            setStatus('error')
            setError(message)
          },
        })
        if (closed) {
          await conv.endSession()
          return
        }
        conversation = conv
        conversationRef.current = conv
        if (pausedRef.current) {
          conv.setMicMuted(true)
          post(`/sessions/${sid}/signals`, { user_speaking: false })
        }
        setStatus('listening')

        const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
        socket = new WebSocket(`${protocol}://${location.host}/api/ws/session/${sid}`)
        socket.addEventListener('message', (m) => {
          const msg = JSON.parse(m.data) as ServerMessage
          if (msg.type === 'snapshot') (msg.data as { events: ScreenEvent[] }).events.forEach(forward)
          else if (msg.type === 'event') forward(msg.data as ScreenEvent)
          else if (msg.type === 'ask_now') {
            // Paused: the mic is muted and nothing is recorded, so a question now could not be answered.
            if (pausedRef.current) return
            const ask = msg.data as AskNow
            pairer.ask(ask.event_id)
            conversation?.sendUserMessage(askText(ask))
          }
        })
      } catch (err) {
        if (closed) return
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    void connect()
    return () => {
      closed = true
      clearInterval(release)
      socket?.close()
      conversationRef.current = null
      void conversation?.endSession()
      setStatus('off')
    }
  }, [sessionId, startedAt])

  // Mute/unmute when pause toggles; does not reconnect the conversation.
  useEffect(() => {
    const conv = conversationRef.current
    if (!conv || !sessionId) return
    if (opts.paused) {
      conv.setMicMuted(true)
      post(`/sessions/${encodeURIComponent(sessionId)}/signals`, { user_speaking: false })
    } else {
      conv.setMicMuted(false)
    }
  }, [opts.paused, sessionId])

  const connected = status === 'listening' || status === 'speaking'
  const muted = Boolean(opts.paused) && connected
  return { status, error, muted }
}
