import { useEffect, useRef, useState } from 'react'
import { formatTs } from '../lib/time'
import type { CaptureStats } from './screenCapture'
import type { useScreenCapture } from './useScreenCapture'
import './capture.css'

const WINDOW_SEC = Number(import.meta.env.VITE_OFF_THE_RECORD_WINDOW_SEC) || 30

const errorText = {
  denied: 'Screen sharing was blocked. Choose a tab or window in the browser prompt and select Share.',
  unsupported: 'This browser cannot share a screen. Use a current version of Chrome, Edge or Safari on a computer.',
  offline: 'The apprentice server is not reachable. Start it, then try again.',
  failed: 'Screen sharing could not start.',
} as const

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 500)
    return () => clearInterval(id)
  }, [])
  return <time>{formatTs(now - since)}</time>
}

function StatsLine({ stats, sessionId }: { stats: CaptureStats; sessionId: string }) {
  return (
    <p className="cap-stats">
      Session {sessionId} · {stats.ticks} frames checked · {stats.changed} changed and sent
      {stats.failed > 0 && <span className="cap-warn"> · {stats.failed} not delivered</span>}
    </p>
  )
}

export function CaptureView({ capture }: { capture: ReturnType<typeof useScreenCapture> }) {
  const { state, start, stop, reset } = capture
  const videoRef = useRef<HTMLVideoElement>(null)
  const live = state.status === 'live' || state.status === 'stopping'
  const paused = state.status === 'live' && state.paused
  const [deskOpened, setDeskOpened] = useState(false)

  const stream = live ? state.capture.stream : null
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    // autoplay does not reliably start when srcObject is assigned after mount.
    video.play().catch(() => {})
  }, [stream])

  if (live) {
    return (
      <div className="cap">
        <div className="cap-preview">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Your shared screen" />
          <div className={`cap-recording glass${paused ? ' paused' : ''}`} role="status">
            <span className="cap-dot" aria-hidden="true" />
            <span>{state.status === 'stopping' ? 'Saving' : paused ? 'Paused' : 'Recording'}</span>
            <Elapsed since={state.capture.startedAt} />
            <button type="button" className="button compact" onClick={stop} disabled={state.status === 'stopping'}>
              Stop sharing
            </button>
          </div>
        </div>
        <StatsLine stats={state.stats} sessionId={state.capture.sessionId} />
        <p className="cap-hint">Once the apprentice is listening, switch to the shared tab. The panel follows in a small window. Work as usual and talk through what you do.</p>
      </div>
    )
  }

  if (state.status === 'ended') {
    return (
      <div className="cap cap-intro">
        <p className="cap-eyebrow">Session {state.sessionId}</p>
        <h1>Capture saved</h1>
        <p className="cap-tagline">
          {formatTs(state.seconds * 1000)} recorded. {state.stats.ticks} frames checked, {state.stats.changed} changed and sent.
          {state.stats.failed > 0 && ` ${state.stats.failed} did not reach the server.`}
        </p>
        <div className="cap-ctas">
          <button type="button" className="button" onClick={reset}>
            Start a new capture
          </button>
        </div>
      </div>
    )
  }

  const requesting = state.status === 'requesting'

  return (
    <div className="cap cap-intro cap-start">
      <h1>Show the apprentice how you work.</h1>
      <p className="cap-tagline">Share the screen where you do the task. The apprentice watches and asks why at natural pauses.</p>

      <ol className="cap-steps">
        <li>
          <p>
            <strong>Open the app</strong> you work in. For the demo, that is the returns desk.
          </p>
          <a
            className={deskOpened ? 'button ghost' : 'button'}
            href="/shop"
            target="_blank"
            rel="noreferrer"
            onClick={() => setDeskOpened(true)}
          >
            Open the returns desk
          </a>
        </li>
        <li>
          <p>
            <strong>Share that tab</strong> when the browser asks. Only the tab is recorded.
          </p>
          <button type="button" className={deskOpened ? 'button' : 'button ghost'} onClick={() => void start()} disabled={requesting}>
            {requesting ? 'Waiting for the browser…' : 'Share screen'}
          </button>
        </li>
        <li>
          <p>
            <strong>Work as usual</strong> and say what you are doing.
          </p>
        </li>
      </ol>

      {state.status === 'error' && (
        <p className="cap-error" role="alert">
          {errorText[state.reason]}
          {state.detail && <span> ({state.detail})</span>}
        </p>
      )}

      <p className="cap-privacy">
        You can pause at any time. Say “off the record” to delete the last {WINDOW_SEC} seconds of screen and speech.
      </p>
    </div>
  )
}
