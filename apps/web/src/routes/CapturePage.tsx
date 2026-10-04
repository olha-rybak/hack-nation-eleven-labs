import { useNavigate } from 'react-router'
import { CaptureView } from '../capture/CaptureView'
import { useInterviewer, type InterviewerStatus } from '../capture/useInterviewer'
import { useScreenCapture } from '../capture/useScreenCapture'
import { SessionLayout } from '../components/SessionLayout'
import { CapturePanel } from '../session/CapturePanel'
import { useSessionFeed } from '../session/useSessionFeed'

function summary(events: number, asks: { question_index: number; budget: number }[]) {
  const last = asks.at(-1)
  const parts = [`${events} ${events === 1 ? 'event' : 'events'}`]
  if (last) parts.push(`${last.question_index} of ${last.budget} asked`)
  return parts.join(' · ')
}

const WINDOW_SEC = Number(import.meta.env.VITE_OFF_THE_RECORD_WINDOW_SEC) || 30

const voiceText: Record<InterviewerStatus, string> = {
  off: 'Voice off',
  connecting: 'Voice connecting…',
  listening: 'Apprentice listening',
  speaking: 'Apprentice speaking',
  error: 'Voice failed',
}

export function CapturePage() {
  const capture = useScreenCapture()
  const navigate = useNavigate()
  const { state } = capture
  const live = state.status === 'live'
  const paused = live && state.paused
  // Keep the panel on the session after Stop, so its record stays readable.
  const sessionId =
    state.status === 'live' || state.status === 'stopping'
      ? state.capture.sessionId
      : state.status === 'ended'
        ? state.sessionId
        : null
  const feed = useSessionFeed(sessionId)
  const offTheRecord = () => {
    if (state.status !== 'live') return Promise.reject(new Error('Not recording'))
    return feed.offTheRecord(WINDOW_SEC)
  }
  const voice = useInterviewer(live ? state.capture.sessionId : null, live ? state.capture.startedAt : null, {
    paused,
    onOffTheRecord: offTheRecord,
  })

  const panel = (
    <CapturePanel
      live={live}
      paused={paused}
      events={feed.events}
      transcript={feed.transcript}
      asks={feed.asks}
      leaving={feed.leaving}
      lastRemoved={feed.lastRemoved}
      correctEvent={feed.correctEvent}
      onPauseToggle={() => {
        if (state.status !== 'live') return
        if (state.paused) capture.resume()
        else capture.pause()
      }}
      onOffTheRecord={offTheRecord}
      onEndTask={async () => {
        if (state.status !== 'live') return
        const id = state.capture.sessionId
        await capture.stop()
        navigate(`/map/${id}`)
      }}
    />
  )

  return (
    <SessionLayout
      sessionId={sessionId}
      panelTitle="Apprentice"
      panel={panel}
      panelSummary={summary(feed.events.length, feed.asks)}
      panelActivity={feed.events.length + feed.transcript.length + feed.asks.length}
    >
      <CaptureView capture={capture} />
      {live && (
        <p className="cap-hint" role="status">
          {paused ? 'Recording paused' : voiceText[voice.status]}
          {!paused && voice.error && ` (${voice.error})`}
        </p>
      )}
    </SessionLayout>
  )
}
