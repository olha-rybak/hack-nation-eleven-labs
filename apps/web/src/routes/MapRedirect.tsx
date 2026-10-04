import { Navigate, useParams } from 'react-router'

// The Work Map page was replaced by the Vault; old /map links land there.
export function MapRedirect() {
  const { sessionId = '' } = useParams()
  return <Navigate to={`/vault/${encodeURIComponent(sessionId)}`} replace />
}
