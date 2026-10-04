import { useEffect, useRef, useState } from 'react'
import { ServerUnreachable, type SessionOptions } from './ingest'
import { ScreenCapture, type CaptureStats } from './screenCapture'

export type CaptureState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'live'; capture: ScreenCapture; stats: CaptureStats; paused: boolean }
  | { status: 'stopping'; capture: ScreenCapture; stats: CaptureStats }
  | { status: 'ended'; sessionId: string; stats: CaptureStats; seconds: number }
  | { status: 'error'; reason: 'denied' | 'unsupported' | 'offline' | 'failed'; detail?: string }

export function useScreenCapture() {
  const [state, setState] = useState<CaptureState>({ status: 'idle' })
  const current = useRef<ScreenCapture | null>(null)

  const finish = (capture: ScreenCapture) => {
    current.current = null
    setState({
      status: 'ended',
      sessionId: capture.sessionId,
      stats: { ...capture.stats },
      seconds: Math.round((performance.now() - capture.startedAt) / 1000),
    })
  }

  async function start(session?: SessionOptions) {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState({ status: 'error', reason: 'unsupported' })
      return
    }
    setState({ status: 'requesting' })
    try {
      const capture = await ScreenCapture.start(
        (stats) => setState((s) => (s.status === 'live' && s.capture === capture ? { ...s, stats } : s)),
        () => finish(capture),
        session,
      )
      current.current = capture
      setState({ status: 'live', capture, stats: { ...capture.stats }, paused: false })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setState({ status: 'error', reason: 'denied' })
      } else if (err instanceof ServerUnreachable) {
        setState({ status: 'error', reason: 'offline' })
      } else {
        setState({ status: 'error', reason: 'failed', detail: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  function pause() {
    const capture = current.current
    if (!capture) return
    capture.pause()
    setState((s) => (s.status === 'live' && s.capture === capture ? { ...s, paused: capture.paused } : s))
  }

  function resume() {
    const capture = current.current
    if (!capture) return
    capture.resume()
    setState((s) => (s.status === 'live' && s.capture === capture ? { ...s, paused: capture.paused } : s))
  }

  async function stop() {
    const capture = current.current
    if (!capture) return
    setState({ status: 'stopping', capture, stats: { ...capture.stats } })
    await capture.stop()
    finish(capture)
  }

  useEffect(() => () => void current.current?.stop(), [])

  return { state, start, pause, resume, stop, reset: () => setState({ status: 'idle' }) }
}
