// Turns ElevenLabs' per-chunk voice activity score into speaking on/off for the pause detector
// (T-104): no question while the expert is talking. Speaking starts at the first score over the
// threshold and ends once no score has been over it for `releaseMs`, so the short dips between
// words don't flip it. The server adds PAUSE_SILENCE_SEC on top before it lets the agent ask.

export class SpeechTracker {
  private readonly threshold: number
  private readonly releaseMs: number
  private speaking = false
  private lastVoice = Number.NEGATIVE_INFINITY

  constructor(threshold: number, releaseMs: number) {
    this.threshold = threshold
    this.releaseMs = releaseMs
  }

  /** A new VAD score. Returns the new state on a change, null otherwise. */
  score(vad: number, now: number): boolean | null {
    if (vad >= this.threshold) {
      this.lastVoice = now
      if (!this.speaking) return (this.speaking = true)
      return null
    }
    return this.expire(now)
  }

  /** Called on a timer too: scores can stop arriving, and speaking must still end. */
  expire(now: number): boolean | null {
    if (this.speaking && now - this.lastVoice >= this.releaseMs) return (this.speaking = false)
    return null
  }
}
