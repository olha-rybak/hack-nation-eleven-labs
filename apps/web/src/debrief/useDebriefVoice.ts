import { Conversation, type Mode } from '@elevenlabs/client'
import { useEffect, useRef, useState } from 'react'
import { MicGate } from '../lib/micGate'
import { spoken } from '../lib/spoken'
import type { DebriefStatus, DraftStep, DraftWorkMap, Gap } from '../types/draft'
import type { TranscriptLine } from '../types/session'
import { answerGap, fetchDebrief } from './api'
import { DebriefTurns, nextGapText } from './turns'
import { api } from '../lib/api'

// The spoken debrief (T-203), same agent pattern as the live interviewer (useInterviewer):
//   next gap from GET /debrief  -> sendUserMessage(NEXT_GAP ...), the agent asks it
//   agent's reply after answer  -> DebriefTurns: answered / declined / stop
//   answered or declined        -> POST /debrief/answer, then the next gap
//   nothing left, or stop       -> DEBRIEF_DONE, closing line, then onFinished (saves the Work Map)
//   mic                         -> muted while the agent speaks and after the expert answered; open
//                                  after each line the agent says, until the closing line (MicGate)

export type DebriefVoiceStatus = 'off' | 'connecting' | 'listening' | 'speaking' | 'error'

export function stepFor(draft: DraftWorkMap, gap: Gap): DraftStep | null {
  const index = draft.guardrails.find((g) => g.id === gap.guardrail_id)?.step_index ?? gap.step_index
  return draft.steps.find((s) => s.index === index) ?? null
}

export function useDebriefVoice(sessionId: string, draft: DraftWorkMap, initial: DebriefStatus, onFinished: () => void) {
  const [status, setStatus] = useState<DebriefVoiceStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [debrief, setDebrief] = useState(initial)
  const [current, setCurrent] = useState<Gap | null>(null)
  const [micOpen, setMicOpen] = useState(false)
  // What is said in the debrief, for the panel. It is not posted to the session transcript,
  // which holds the capture conversation the Work Map is built from.
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const conversation = useRef<Conversation | null>(null)
  const asking = useRef<Gap | null>(null)
  const skipRef = useRef<() => void>(() => {})

  useEffect(() => () => void conversation.current?.endSession(), [])

  async function start() {
    setStatus('connecting')
    setError(null)
    const turns = new DebriefTurns()
    const t0 = performance.now()
    // Debrief quotes are timed after the task: the last screen moment plus time into the debrief.
    const base = Math.max(0, ...draft.steps.map((s) => s.frame_ts))
    const now = () => base + Math.round(performance.now() - t0)
    let closing = false // DEBRIEF_DONE sent, or the expert asked to stop
    let closingSaid = false
    // No answer window: the expert has nothing else to do, and a slow answer must not be cut off.
    const gate = new MicGate(Number.POSITIVE_INFINITY)
    let mic: boolean | null = null
    const applyMic = () => {
      const open = gate.open(performance.now())
      if (!conversation.current || open === mic) return
      mic = open
      conversation.current.setMicMuted(!open)
      setMicOpen(open)
    }
    let queue = Promise.resolve()
    const serial = (work: () => Promise<void>) => {
      queue = queue.then(work).catch((err: unknown) => {
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      })
    }

    const advance = async () => {
      const next = await fetchDebrief(sessionId)
      setDebrief(next)
      setCurrent(next.next)
      asking.current = next.next
      const conv = conversation.current
      if (!conv) return
      if (!next.next) {
        closing = true
        conv.sendUserMessage('DEBRIEF_DONE')
        return
      }
      const step = stepFor(draft, next.next)
      turns.cue(next.next.id)
      conv.sendUserMessage(nextGapText(next.next, step && `${step.title}: ${step.decision}`))
    }

    skipRef.current = () =>
      serial(async () => {
        const gap = asking.current
        if (!gap || closing) return
        turns.cue('') // ignore the rest of this gap's conversation
        await answerGap(sessionId, { gap_id: gap.id, declined: true })
        await advance()
      })

    try {
      const config = (await (await fetch(api('/config'))).json()) as {
        debrief_agent_id?: string
        debrief_prompt_override?: boolean
      }
      if (!config.debrief_agent_id) throw new Error('ELEVENLABS_DEBRIEF_AGENT_ID is not set in .env')
      // A dedicated debrief agent has the prompt in its dashboard; the interviewer agent needs it sent.
      const overrides = config.debrief_prompt_override
        ? { agent: { prompt: { prompt: await (await fetch(api('/prompts/debrief/system.md'))).text() }, firstMessage: '' } }
        : undefined
      conversation.current = await Conversation.startSession({
        agentId: config.debrief_agent_id,
        connectionType: 'webrtc',
        overrides,
        onModeChange: ({ mode }: { mode: Mode }) => {
          setStatus(mode)
          gate.agentMode(mode === 'speaking', performance.now())
          applyMic()
          if (closing && closingSaid && mode === 'listening') {
            closing = closingSaid = false
            void conversation.current?.endSession()
            conversation.current = null
            setStatus('off')
            setMicOpen(false)
            onFinished()
          }
        },
        onMessage: ({ message, role }) => {
          const speaker = role === 'agent' ? 'agent' : 'expert'
          const ts_ms = Math.round(performance.now() - t0)
          setLines((l) => [...l, { id: `debrief-${l.length}`, speaker, text: message, ts_ms }])
          if (role !== 'agent') {
            gate.close()
            applyMic()
            return turns.expert(message)
          }
          message = spoken(message)
          if (closing) {
            closingSaid = true
            gate.close()
            applyMic()
            return
          }
          gate.question(performance.now())
          applyMic()
          const outcome = turns.agent(message)
          if (!outcome) return
          if (outcome.kind === 'stop') {
            closing = closingSaid = true // the stop line is the closing line
            gate.close()
            applyMic()
            return
          }
          serial(async () => {
            const body =
              outcome.kind === 'answered'
                ? { gap_id: outcome.gapId, text: outcome.text, ts_ms: now() }
                : { gap_id: outcome.gapId, declined: true as const }
            await answerGap(sessionId, body)
            await advance()
          })
        },
        onError: (message: string) => {
          setStatus('error')
          setError(message)
        },
      })
      applyMic() // muted until the first question
      setStatus('listening')
      serial(advance)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return { status, error, debrief, current, micOpen, lines, start, skip: () => skipRef.current() }
}
