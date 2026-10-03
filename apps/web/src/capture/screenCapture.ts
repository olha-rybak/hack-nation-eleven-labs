import { hasChanged, THUMB_WIDTH, toThumb, type Thumb } from './changeDetect'
import { createSession, endSession, postFrame } from './ingest'

const FPS = Number(import.meta.env.VITE_FRAME_FPS) || 1
const MIN_CELLS = Number(import.meta.env.VITE_FRAME_CHANGE_MIN_CELLS) || 12
const MAX_EDGE = 1280
const JPEG_QUALITY = 0.8

export interface CaptureStats {
  ticks: number
  changed: number
  uploaded: number
  failed: number
}

// ImageCapture is in Chromium but not yet in TypeScript's DOM lib.
interface FrameGrabber {
  grabFrame(): Promise<ImageBitmap>
}
declare const ImageCapture: { new (track: MediaStreamTrack): FrameGrabber } | undefined

function canvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height)
}

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export class ScreenCapture {
  readonly stream: MediaStream
  readonly sessionId: string
  readonly startedAt = performance.now()
  stats: CaptureStats = { ticks: 0, changed: 0, uploaded: 0, failed: 0 }

  private track: MediaStreamTrack
  private grabber: FrameGrabber | null
  private video: HTMLVideoElement | null = null
  private worker: Worker
  private lastSent: Thumb | null = null
  private lastTs = -1
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  private onStats: (stats: CaptureStats) => void
  private onEnded: () => void

  private constructor(stream: MediaStream, sessionId: string, onStats: (s: CaptureStats) => void, onEnded: () => void) {
    this.stream = stream
    this.sessionId = sessionId
    this.onStats = onStats
    this.onEnded = onEnded
    this.track = stream.getVideoTracks()[0]
    this.grabber = typeof ImageCapture === 'function' ? new ImageCapture(this.track) : null
    if (!this.grabber) {
      this.video = document.createElement('video')
      this.video.muted = true
      this.video.srcObject = stream
      void this.video.play()
    }
    // The browser's own "Stop sharing" control ends the track; treat it like our Stop button.
    this.track.addEventListener('ended', () => void this.stop().then(this.onEnded))

    this.worker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = () => this.tick()
    this.worker.postMessage({ periodMs: Math.round(1000 / FPS) })
    this.tick()
  }

  static async start(onStats: (s: CaptureStats) => void, onEnded: () => void): Promise<ScreenCapture> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: { ideal: 5, max: 10 } },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    } as DisplayMediaStreamOptions)
    try {
      const sessionId = await createSession()
      return new ScreenCapture(stream, sessionId, onStats, onEnded)
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop())
      throw err
    }
  }

  /** Current position on the session timeline, in the same ms as frame_ts. */
  elapsed(): number {
    return Math.round(performance.now() - this.startedAt)
  }

  private now(): number {
    // Monotonic ms since session start; never repeats even if two ticks land in the same ms.
    const ts = Math.max(Math.round(performance.now() - this.startedAt), this.lastTs + 1)
    this.lastTs = ts
    return ts
  }

  private tick() {
    if (this.stopped) return
    const frameTs = this.now()
    this.stats.ticks++
    this.queue = this.queue.then(() => this.process(frameTs))
  }

  private async grab(): Promise<ImageBitmap | null> {
    if (this.track.readyState !== 'live') return null
    if (this.grabber) {
      try {
        return await this.grabber.grabFrame()
      } catch {
        return null
      }
    }
    const v = this.video
    if (!v || v.videoWidth === 0) return null
    return createImageBitmap(v)
  }

  private async process(frameTs: number) {
    let jpeg: Blob | null = null
    const bitmap = await this.grab()
    if (bitmap) {
      const t = fit(bitmap.width, bitmap.height, THUMB_WIDTH)
      const small = canvas(t.width, t.height)
      const sctx = small.getContext('2d', { willReadFrequently: true })!
      sctx.drawImage(bitmap, 0, 0, t.width, t.height)
      const thumb = toThumb(sctx.getImageData(0, 0, t.width, t.height).data, t.width, t.height)

      if (hasChanged(this.lastSent, thumb, MIN_CELLS)) {
        const f = fit(bitmap.width, bitmap.height, MAX_EDGE)
        const full = canvas(f.width, f.height)
        full.getContext('2d')!.drawImage(bitmap, 0, 0, f.width, f.height)
        jpeg = await full.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
        this.lastSent = thumb
        this.stats.changed++
      }
      bitmap.close()
    }

    // Unchanged (or ungrabbable) frames still post their timestamp: the timeline needs continuous time.
    try {
      await postFrame(this.sessionId, frameTs, jpeg)
      this.stats.uploaded++
    } catch {
      this.stats.failed++
      if (jpeg) this.lastSent = null
    }
    this.onStats({ ...this.stats })
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.worker.postMessage({ periodMs: null })
    this.worker.terminate()
    await this.queue
    this.stream.getTracks().forEach((t) => t.stop())
    if (this.video) this.video.srcObject = null
    try {
      await endSession(this.sessionId)
    } catch {
      // The session log is already on disk; failing to stop the ask loop is not worth an error screen.
    }
  }
}
