import { Conversation, type Mode } from '@elevenlabs/client'
import { useEffect, useState } from 'react'
import type { ScreenEvent } from '../types/session'
import { AnswerPairer } from './answers'

// The voice side of a live capture, same contract as the server's interviewer test page:
//   screen events      -> sendContextualUpdate (silent background context)
//   ask_now from server -> sendUserMessage("ASK_NOW" + subject + Known list), the agent asks one question
//   what is said       -> POST /sessions/:id/transcript, agent mode -> POST /sessions/:id/signals
//   question + answer  -> POST /knowledge/answers, so the next session doesn't ask it again

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

export function useInterviewer(sessionId: string | null, startedAt: number | null) {
  const [status, setStatus] = useState<InterviewerStatus>('off')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId || startedAt == null) return
    const sid = encodeURIComponent(sessionId)
    let conversation: Conversation | null = null
    let socket: WebSocket | null = null
    let closed = false
    const sentEvents = new Set<string>()
    const pairer = new AnswerPairer()

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
          onModeChange: ({ mode }: { mode: Mode }) => {
            setStatus(mode)
            post(`/sessions/${sid}/signals`, { agent_speaking: mode === 'speaking' })
          },
          onMessage: ({ message, role }) => {
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
        setStatus('listening')

        const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
        socket = new WebSocket(`${protocol}://${location.host}/api/ws/session/${sid}`)
        socket.addEventListener('message', (m) => {
          const msg = JSON.parse(m.data) as ServerMessage
          if (msg.type === 'snapshot') (msg.data as { events: ScreenEvent[] }).events.forEach(forward)
          else if (msg.type === 'event') forward(msg.data as ScreenEvent)
          else if (msg.type === 'ask_now') {
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
      socket?.close()
      void conversation?.endSession()
      setStatus('off')
    }
  }, [sessionId, startedAt])

  return { status, error }
}
