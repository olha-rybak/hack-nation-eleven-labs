import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, endSession, postFrame } from './ingest'
import { ScreenCapture } from './screenCapture'

vi.mock('./ingest', () => ({
  createSession: vi.fn().mockResolvedValue('session'),
  endSession: vi.fn().mockResolvedValue(undefined),
  postFrame: vi.fn().mockResolvedValue(undefined),
}))

describe('capture pause', () => {
  let tick: () => void
  let grab: ReturnType<typeof vi.fn>
  let stopTrack: ReturnType<typeof vi.fn>
  let terminate: ReturnType<typeof vi.fn>
  let workerPost: ReturnType<typeof vi.fn>
  let capture: ScreenCapture

  const bitmap = () => ({ width: 1, height: 1, close: vi.fn() }) as unknown as ImageBitmap

  beforeEach(() => {
    vi.clearAllMocks()
    grab = vi.fn().mockImplementation(async () => bitmap())
    stopTrack = vi.fn()
    terminate = vi.fn()
    workerPost = vi.fn()
    const track = { readyState: 'live', stop: stopTrack, addEventListener: vi.fn() }
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue({
        getVideoTracks: () => [track], getTracks: () => [track],
      }) },
    })
    vi.stubGlobal('ImageCapture', class {
      grabFrame = grab
    })
    vi.stubGlobal('Worker', class {
      set onmessage(handler: () => void) { tick = handler }
      postMessage = workerPost
      terminate = terminate
    })
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() {
        return { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) }
      }
      async convertToBlob() { return new Blob(['frame'], { type: 'image/jpeg' }) }
    })
  })

  afterEach(async () => {
    await capture?.stop()
    vi.unstubAllGlobals()
  })

  it('does not grab, post empty ticks, or increment stats while paused; stops normally', async () => {
    capture = await ScreenCapture.start(vi.fn(), vi.fn())
    await vi.waitFor(() => expect(capture.stats.uploaded).toBe(1))
    capture.pause()
    capture.pause()
    expect(capture.paused).toBe(true)
    const stats = { ...capture.stats }
    grab.mockRejectedValue(new Error('no frame'))
    tick()
    tick()
    await capture.stop()
    expect(capture.stats).toEqual(stats)
    expect(grab).toHaveBeenCalledTimes(1)
    expect(postFrame).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledTimes(1)
    expect(stopTrack).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(workerPost).toHaveBeenLastCalledWith({ periodMs: null })
    expect(endSession).toHaveBeenCalledWith('session')
  })

  it('keeps resources alive and uploads an identical screen after resume', async () => {
    capture = await ScreenCapture.start(vi.fn(), vi.fn())
    await vi.waitFor(() => expect(capture.stats.uploaded).toBe(1))
    tick()
    await vi.waitFor(() => expect(capture.stats.uploaded).toBe(2))
    expect(vi.mocked(postFrame).mock.calls[1][2]).toBeNull()
    capture.pause()
    expect(stopTrack).not.toHaveBeenCalled()
    expect(terminate).not.toHaveBeenCalled()
    expect(workerPost).toHaveBeenCalledTimes(1)
    capture.resume()
    capture.resume()
    expect(capture.paused).toBe(false)
    tick()
    await vi.waitFor(() => expect(capture.stats.uploaded).toBe(3))
    expect(vi.mocked(postFrame).mock.calls[2][2]).toBeInstanceOf(Blob)
    expect(vi.mocked(postFrame).mock.calls[2][1]).toBeGreaterThan(vi.mocked(postFrame).mock.calls[1][1])
  })

  it('lets queued work finish without losing the resumed frame reset', async () => {
    let finishGrab!: (frame: ImageBitmap) => void
    grab.mockImplementationOnce(() => new Promise<ImageBitmap>((resolve) => { finishGrab = resolve }))
    capture = await ScreenCapture.start(vi.fn(), vi.fn())
    await vi.waitFor(() => expect(grab).toHaveBeenCalledTimes(1))
    capture.pause()
    tick()
    expect(capture.stats.ticks).toBe(1)
    capture.resume()
    tick()
    finishGrab(bitmap())
    await vi.waitFor(() => expect(capture.stats.uploaded).toBe(2))
    expect(grab).toHaveBeenCalledTimes(2)
    expect(vi.mocked(postFrame).mock.calls.map((call) => call[2])).toEqual([expect.any(Blob), expect.any(Blob)])
  })
})
