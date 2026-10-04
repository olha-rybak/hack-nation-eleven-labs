// When the expert's mic is open to the voice agent. Closed by default, so room noise and talking
// to yourself never reach the agent: it opens once the agent has finished asking a question and
// closes again when the expert has answered, or after `windowMs` without their voice.

export class MicGate {
  private readonly windowMs: number
  private wanted = false
  private agentSpeaking = false
  private lastActivity = Number.NEGATIVE_INFINITY

  constructor(windowMs: number) {
    this.windowMs = windowMs
  }

  /** The agent asked something and waits for an answer. */
  question(now: number): void {
    this.wanted = true
    this.lastActivity = now
  }

  /** The expert's answer arrived, or the agent moved on without waiting for one. */
  close(): void {
    this.wanted = false
  }

  agentMode(speaking: boolean, now: number): void {
    if (this.agentSpeaking && !speaking) this.lastActivity = now // the answer window starts here
    this.agentSpeaking = speaking
  }

  /** The expert is speaking: keep the mic open while they think out loud. */
  voice(now: number): void {
    this.lastActivity = now
  }

  open(now: number): boolean {
    if (this.wanted && !this.agentSpeaking && now - this.lastActivity >= this.windowMs) this.wanted = false
    return this.wanted && !this.agentSpeaking
  }
}
