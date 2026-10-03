import { useNavigate } from 'react-router'
import { CaptureView } from '../capture/CaptureView'
import { useScreenCapture } from '../capture/useScreenCapture'
import { SessionLayout } from '../components/SessionLayout'
import { CapturePanel } from '../session/CapturePanel'
import { useSessionFeed } from '../session/useSessionFeed'

const WINDOW_MS = (Number(import.meta.env.VITE_OFF_THE_RECORD_WINDOW_SEC) || 30) * 1000

export function CapturePage() {
  const capture = useScreenCapture()
  const navigate = useNavigate()
  const { state } = capture
  const live = state.status === 'live'
  // Keep the panel on the session after Stop, so its record stays readable.
  const sessionId =
    state.status === 'live' || state.status === 'stopping'
      ? state.capture.sessionId
      : state.status === 'ended'
        ? state.sessionId
        : null
  const feed = useSessionFeed(sessionId)

  const panel = (
    <CapturePanel
      live={live}
      events={feed.events}
      transcript={feed.transcript}
      asks={feed.asks}
      leaving={feed.leaving}
      lastRemoved={feed.lastRemoved}
      correctEvent={feed.correctEvent}
      onOffTheRecord={() => {
        if (state.status !== 'live') return Promise.reject(new Error('Not recording'))
        return feed.offTheRecord(state.capture.elapsed(), WINDOW_MS)
      }}
      onEndTask={async () => {
        if (state.status !== 'live') return
        const id = state.capture.sessionId
        await capture.stop()
        navigate(`/map/${id}`)
      }}
    />
  )

  return (
    <SessionLayout sessionId={sessionId} panelTitle="Apprentice" panel={panel}>
      <CaptureView capture={capture} />
    </SessionLayout>
  )
}
