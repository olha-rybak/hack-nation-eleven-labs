import { useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'
import { useWorkMap } from '../workmap/useWorkMap'
import { WorkMapView } from '../workmap/WorkMapView'

export function MapPage() {
  const { sessionId = '' } = useParams()
  const state = useWorkMap(sessionId)

  return (
    <SessionLayout sessionId={sessionId} panelTitle="Debrief">
      {state.status === 'ready' && <WorkMapView sessionId={sessionId} map={state.map} />}
      {state.status === 'loading' && <p className="placeholder">Loading the Work Map…</p>}
      {state.status === 'missing' && (
        <div className="placeholder">
          <h1>No Work Map yet</h1>
          <p>
            Session <code>{sessionId}</code> has no Work Map. It appears here after the debrief.
          </p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="placeholder">
          <h1>The Work Map could not be loaded</h1>
          <p>{state.message}. Check that the server is running, then reload the page.</p>
        </div>
      )}
    </SessionLayout>
  )
}
