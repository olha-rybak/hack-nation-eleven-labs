import { Link, useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'
import { useDraft } from '../debrief/useDraft'
import '../debrief/debrief.css'

export function DebriefPage() {
  const { sessionId = '' } = useParams()
  const { state, retry } = useDraft(sessionId)

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
            {state.draft.gaps.length === 0
              ? 'Nothing left to ask. Every step and guardrail has your words.'
              : `${state.draft.gaps.length} ${state.draft.gaps.length === 1 ? 'question' : 'questions'} the apprentice still has, most important first.`}
          </p>
          <ol className="debrief-gaps">
            {state.draft.gaps.map((gap) => (
              <li key={gap.id}>
                <p className="debrief-question">{gap.question}</p>
                <p className="debrief-why">{gap.why_it_matters}</p>
              </li>
            ))}
          </ol>
          <Link className="link more" to={`/map/${encodeURIComponent(sessionId)}`}>
            Work Map
          </Link>
        </div>
      )}
    </SessionLayout>
  )
}
