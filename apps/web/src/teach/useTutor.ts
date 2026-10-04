import { Conversation, type Mode } from '@elevenlabs/client'
import { useEffect, useRef, useState } from 'react'
import { SpeechTracker } from '../capture/speech'
import { api, wsUrl } from '../lib/api'
import type { ScreenEvent } from '../types/session'
import type { WorkMap } from '../types/workmap'
import {
  caseOpenedCue,
  eventLine,
  hitCue,
  hitKey,
  lookupGuardrail,
  lookupStep,
  pauseCue,
  resolvedCue,
  workMapBrief,
  type GuardrailHit,
  type GuardrailResolved,
} from './tutorCues'

// The tutor's voice on a tutor session (T-302), same contract as the interviewer hook:
//   Work Map            -> sendContextualUpdate once (steps, guardrails, expert quotes verbatim)
//   screen events       -> sendContextualUpdate (silent); a newly opened case -> CASE_OPENED
//   guardrail_hit       -> STOP/WARN at once, not waiting for a pause (T-300 timing)
//   guardrail_resolved  -> RESOLVED, only for a hit the tutor raised
//   ask_now (pause)     -> PAUSE, unless an intervention is still open
//   lookup_guardrail / lookup_step client tools -> exact wording from the map
//   what is said -> POST /sessions/:id/transcript, voice state -> POST /sessions/:id/signals

const VAD_THRESHOLD = Number(import.meta.env.VITE_VAD_SPEECH_THRESHOLD) || 0.5
const VAD_RELEASE_MS = Number(import.meta.env.VITE_VAD_RELEASE_MS) || 400

export type TutorStatus = 'off' | 'connecting' | 'listening' | 'speaking' | 'error'

type ServerMessage =
  | { type: 'snapshot'; data: { events: ScreenEvent[]; guardrails?: ({ type: string } & Record<string, unknown>)[] } }
  | { type: 'event'; data: ScreenEvent }
  | { type: 'guardrail_hit'; data: GuardrailHit }
  | { type: 'guardrail_resolved'; data: GuardrailResolved }
  | { type: 'ask_now'; data: { subject: string; known?: { text: string }[] } }
  | { type: string; data: unknown }

function post(path: string, body: unknown) {
  void fetch(api(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {})
}

export function useTutor(sessionId: string | null, startedAt: number | null, map: WorkMap | null) {
  const [status, setStatus] = useState<TutorStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [hits, setHits] = useState<GuardrailHit[]>([])
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const mapRef = useRef(map)
  useEffect(() => {
    mapRef.current = map
  })

  useEffect(() => {
    if (!sessionId || startedAt == null) return
    const sid = encodeURIComponent(sessionId)
    let conversation: Conversation | null = null
    let socket: WebSocket | null = null
    let closed = false
    const seenEvents = new Map<string, ScreenEvent>() // replayed to the agent once it connects
    const sentEvents = new Set<string>()
    const openedCases = new Set<string>()
    const open = new Map<string, GuardrailHit>() // guardrail id + entity -> unresolved hit
    const key = hitKey
    const speech = new SpeechTracker(VAD_THRESHOLD, VAD_RELEASE_MS)
    const userSpeaking = (speaking: boolean | null) => {
      if (speaking !== null) post(`/sessions/${sid}/signals`, { user_speaking: speaking })
    }
    const release = setInterval(() => userSpeaking(speech.expire(performance.now())), 200)

    const send = (e: ScreenEvent) => {
      if (!conversation || sentEvents.has(e.id)) return
      sentEvents.add(e.id)
      conversation.sendContextualUpdate(`Screen event: ${eventLine(e)}`)
    }
    const forward = (e: ScreenEvent, live: boolean) => {
      seenEvents.set(e.id, e)
      send(e)
      if (e.kind === 'open' && !openedCases.has(e.entity)) {
        openedCases.add(e.entity)
        if (live) conversation?.sendUserMessage(caseOpenedCue(e.entity))
      }
    }
    const onHit = (hit: GuardrailHit, live: boolean) => {
      open.set(key(hit), hit)
      setHits((all) => [...all, hit])
      if (live) conversation?.sendUserMessage(hitCue(hit))
    }
    const onResolved = (r: GuardrailResolved, live: boolean) => {
      const hit = open.get(key(r))
      if (!hit) return
      open.delete(key(r))
      setResolved((s) => new Set(s).add(key(r)))
      if (live) conversation?.sendUserMessage(resolvedCue(hit))
    }

    // The screen side works without the voice: interventions still show if the agent is down.
    socket = new WebSocket(wsUrl(`/ws/session/${sid}`))
    socket.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data) as ServerMessage
      if (msg.type === 'snapshot') {
        // A reconnect replays history silently; only new messages make the tutor speak.
        const snap = msg.data as Extract<ServerMessage, { type: 'snapshot' }>['data']
        snap.events.forEach((e) => forward(e, false))
        for (const g of snap.guardrails ?? []) {
          if (g.type === 'guardrail_hit') onHit(g as unknown as GuardrailHit, false)
          else if (g.type === 'guardrail_resolved') onResolved(g as unknown as GuardrailResolved, false)
        }
      } else if (msg.type === 'event') forward(msg.data as ScreenEvent, true)
      else if (msg.type === 'guardrail_hit') onHit(msg.data as GuardrailHit, true)
      else if (msg.type === 'guardrail_resolved') onResolved(msg.data as GuardrailResolved, true)
      else if (msg.type === 'ask_now' && open.size === 0) {
        conversation?.sendUserMessage(pauseCue(msg.data as { subject: string; known?: { text: string }[] }))
      }
    })

    async function connect() {
      setStatus('connecting')
      setError(null)
      try {
        const config = (await (await fetch(api('/config'))).json()) as { tutor_agent_id?: string }
        if (!config.tutor_agent_id) throw new Error('ELEVENLABS_TUTOR_AGENT_ID is not set in .env')
        const conv = await Conversation.startSession({
          agentId: config.tutor_agent_id,
          connectionType: 'webrtc',
          clientTools: {
            lookup_guardrail: ({ guardrail_id }: { guardrail_id: string }) =>
              mapRef.current ? lookupGuardrail(mapRef.current, guardrail_id) : 'No Work Map loaded.',
            lookup_step: ({ index }: { index: number }) =>
              mapRef.current ? lookupStep(mapRef.current, Number(index)) : 'No Work Map loaded.',
          },
          onModeChange: ({ mode }: { mode: Mode }) => {
            setStatus(mode)
            post(`/sessions/${sid}/signals`, { agent_speaking: mode === 'speaking' })
          },
          onVadScore: ({ vadScore }: { vadScore: number }) => userSpeaking(speech.score(vadScore, performance.now())),
          onMessage: ({ message, role }) => {
            const speaker = role === 'agent' ? 'agent' : 'trainee'
            post(`/sessions/${sid}/transcript`, { speaker, text: message, ts_ms: Math.round(performance.now() - startedAt!) })
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
        if (mapRef.current) conv.sendContextualUpdate(workMapBrief(mapRef.current))
        seenEvents.forEach(send)
        setStatus('listening')
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
      void conversation?.endSession()
      setStatus('off')
      setHits([])
      setResolved(new Set())
    }
  }, [sessionId, startedAt])

  return { status, error, hits, resolved }
}
