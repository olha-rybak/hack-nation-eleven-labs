import { useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'

export function MapPage() {
  const { sessionId = '' } = useParams()

  return (
    <SessionLayout sessionId={sessionId} panelTitle="Debrief">
      <div className="placeholder">
        <h1>Work Map</h1>
        <p>
          Session <code>{sessionId}</code>. Every step will show the screen moment, the decision, the
          expert's reason and its guardrails.
        </p>
        <p className="todo">The timeline arrives with T-202.</p>
      </div>
    </SessionLayout>
  )
}
