import { useParams, useSearchParams } from 'react-router'
import { TeachScenarios } from '../teach/TeachScenarios'
import { TeachWorkspace } from '../teach/TeachWorkspace'

export function TeachPage() {
  const { workMapId = '' } = useParams()
  const [params] = useSearchParams()
  return params.get('preview') === '1'
    ? <TeachScenarios key={workMapId} workMapId={workMapId} />
    : <TeachWorkspace key={workMapId} workMapId={workMapId} />
}
