import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'
import { finishDebrief } from '../debrief/api'
import { useDraft } from '../debrief/useDraft'
import '../debrief/debrief.css'

export function DebriefPage() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { state, retry } = useDraft(sessionId)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  async function finish() {
    setFinishing(true)
    setFinishError(null)
    try {
      await finishDebrief(sessionId)
      navigate(`/map/${encodeURIComponent(sessionId)}`)
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : String(err))
      setFinishing(false)
    }
  }

  return (
    <SessionLayout sessionId={sessionId} panelTitle="Debrief">
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
        <div className="placeholder debrief">
          <h1>{state.draft.title}</h1>
          <p>
            {state.debrief.done
              ? 'Nothing left to ask. Finish to save the Work Map.'
              : `${state.debrief.left} ${state.debrief.left === 1 ? 'gap' : 'gaps'} left, in the order the apprentice will ask them.`}
          </p>
          <ol className="debrief-gaps">
            {state.debrief.queue.map((gap) => (
              <li key={gap.id}>
                <p className="debrief-question">{gap.question}</p>
                <p className="debrief-why">{gap.why_it_matters}</p>
              </li>
            ))}
          </ol>
          <button type="button" className={state.debrief.done ? 'button' : 'button ghost'} disabled={finishing} onClick={finish}>
            {finishing ? 'Saving the Work Map…' : state.debrief.done ? 'Finish debrief' : 'Stop here and save the Work Map'}
          </button>
          {finishError && (
            <p className="debrief-why" role="alert">
              {finishError}.
            </p>
          )}
        </div>
      )}
    </SessionLayout>
  )
}
