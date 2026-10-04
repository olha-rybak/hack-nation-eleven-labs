import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'
import { Transcript } from '../components/Transcript'
import { finishDebrief } from '../debrief/api'
import { stepFor, useDebriefVoice, type DebriefVoiceStatus } from '../debrief/useDebriefVoice'
import { useDraft } from '../debrief/useDraft'
import type { DebriefStatus, DraftWorkMap } from '../types/draft'
import type { TranscriptLine } from '../types/session'
import { frameUrl } from '../workmap/api'
import '../debrief/debrief.css'

const voiceText: Record<DebriefVoiceStatus, string> = {
  off: 'Voice off',
  connecting: 'Connecting…',
  listening: 'Mic off',
  speaking: 'Apprentice speaking',
  error: 'Voice failed',
}

export function DebriefPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { state, retry } = useDraft(sessionId)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [lines, setLines] = useState<TranscriptLine[]>([])

  async function finish(confirmed = false) {
    // A confirmed map was saved before the teach-back; finishing again would hit the frozen map.
    if (confirmed) return navigate(`/rules/${encodeURIComponent(sessionId)}`, { state: { noWorkMap: false } })
    setFinishing(true)
    setFinishError(null)
    try {
      const finished = await finishDebrief(sessionId)
      navigate(`/rules/${encodeURIComponent(sessionId)}`, { state: { noWorkMap: finished === null } })
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : String(err))
      setFinishing(false)
    }
  }

  return (
    <SessionLayout
      sessionId={sessionId}
      panelTitle="Debrief"
      panel={<Transcript title="Debrief" lines={lines} empty="The debrief conversation appears here once you start it." />}
      panelActivity={lines.length}
    >
      {(state.status === 'loading' || state.status === 'building') && (
        <div className="placeholder" role="status">
          <h1>Preparing your debrief…</h1>
          <p>The apprentice is going over the session to find what it still needs to ask. This takes a few seconds.</p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="placeholder">
          <h1>The debrief could not be prepared</h1>
          <p>{state.message}.</p>
          <button type="button" className="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <Debrief
          key={state.draft.id}
          sessionId={sessionId}
          draft={state.draft}
          initial={state.debrief}
          finishing={finishing}
          finishError={finishError}
          onFinish={(confirmed) => void finish(confirmed)}
          onLines={setLines}
        />
      )}
    </SessionLayout>
  )
}

interface DebriefProps {
  sessionId: string
  draft: DraftWorkMap
  initial: DebriefStatus
  finishing: boolean
  finishError: string | null
  onFinish: (confirmed?: boolean) => void
  onLines: (lines: TranscriptLine[]) => void
}

function Debrief({ sessionId, draft, initial, finishing, finishError, onFinish, onLines }: DebriefProps) {
  const voice = useDebriefVoice(sessionId, draft, initial, onFinish)
  useEffect(() => onLines(voice.lines), [voice.lines, onLines])
  const { debrief, current } = voice
  const running = voice.status !== 'off' && voice.status !== 'error'
  const step = current && stepFor(draft, current)

  return (
    <div className="placeholder debrief">
      <h1>{draft.title}</h1>
      <p>
        {debrief.done
          ? 'Nothing left to ask. Finish to save the Work Map.'
          : `${debrief.left} ${debrief.left === 1 ? 'gap' : 'gaps'} left${running ? '' : ', in the order the apprentice will ask them'}.`}
      </p>

      {running && (
        <p className="debrief-why" role="status">
          {voice.micOpen ? 'Mic on: answer the question' : voiceText[voice.status]}
        </p>
      )}
      {voice.error && (
        <p className="debrief-why" role="alert">
          {voice.error}.
        </p>
      )}

      {voice.teachBack && (
        <section className="debrief-current" aria-label="Teach-back">
          <p className="debrief-why">The apprentice explains it back. Say what is wrong, or that it is right.</p>
          <p className="debrief-question">{voice.teachBack.text}</p>
          {voice.teachBack.changes.length > 0 && (
            <ul className="debrief-changes" aria-label="Changes to the Work Map">
              {voice.teachBack.changes.map((c, i) => (
                <li key={i}>
                  <span className="debrief-why">{c.target === 'step' ? `Step ${c.ref}` : 'Rule'} · {c.field}</span>
                  <del>{c.before}</del>
                  <ins>{c.after}</ins>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="button ghost compact" onClick={voice.confirm}>
            Confirm the Work Map as it is
          </button>
        </section>
      )}

      {running && current && !voice.teachBack && (
        <section className="debrief-current" aria-label="Current question">
          <p className="debrief-question">{current.question}</p>
          {step && (
            <figure>
              <img src={frameUrl(sessionId, step.frame_ts)} alt={`The screen at ${step.title}`} />
              <figcaption className="debrief-why">{step.title}</figcaption>
            </figure>
          )}
          <button type="button" className="button ghost compact" onClick={voice.skip}>
            Skip this question
          </button>
        </section>
      )}

      {!running && (
        <ol className="debrief-gaps">
          {debrief.queue.map((gap) => (
            <li key={gap.id}>
              <p className="debrief-question">{gap.question}</p>
              <p className="debrief-why">{gap.why_it_matters}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="debrief-actions">
        {!running && !debrief.done && (
          <button type="button" className="button" onClick={() => void voice.start()}>
            Start debrief
          </button>
        )}
        {!voice.teachBack && (
          <button type="button" className={debrief.done ? 'button' : 'button ghost'} disabled={finishing} onClick={() => onFinish()}>
            {finishing ? 'Saving the Work Map…' : debrief.done ? 'Finish debrief' : 'Stop here and save the Work Map'}
          </button>
        )}
      </div>
      {finishError && (
        <p className="debrief-why" role="alert">
          {finishError}.
        </p>
      )}
    </div>
  )
}
