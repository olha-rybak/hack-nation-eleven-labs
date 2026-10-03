import { useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'

export function TeachPage() {
  const { workMapId = '' } = useParams()

  return (
    <SessionLayout sessionId={workMapId} panelTitle="Tutor">
      <div className="placeholder">
        <h1>Teach</h1>
        <p>
          Work Map <code>{workMapId}</code>. The new hire shares their screen and the tutor coaches them
          through a case.
        </p>
        <p className="todo">The coaching overlay arrives with T-301.</p>
      </div>
    </SessionLayout>
  )
}
