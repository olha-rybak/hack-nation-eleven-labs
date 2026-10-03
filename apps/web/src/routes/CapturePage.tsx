import { useState } from 'react'
import { CaptureView } from '../capture/CaptureView'
import { SessionLayout } from '../components/SessionLayout'

export function CapturePage() {
  const [sessionId, setSessionId] = useState<string | null>(null)

  return (
    <SessionLayout sessionId={sessionId} panelTitle="Conversation">
      <CaptureView onSession={setSessionId} />
    </SessionLayout>
  )
}
