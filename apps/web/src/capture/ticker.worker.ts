// The capture tab sits in the background while the expert works in the ERP, and browsers
// throttle timers in hidden tabs (Chrome down to once a minute after a few minutes).
// Timers in a worker are not throttled that way, so the sampling clock lives here.

let timer: ReturnType<typeof setInterval> | undefined

self.onmessage = (e: MessageEvent<{ periodMs: number | null }>) => {
  clearInterval(timer)
  timer = undefined
  const { periodMs } = e.data
  if (periodMs) timer = setInterval(() => self.postMessage('tick'), periodMs)
}
