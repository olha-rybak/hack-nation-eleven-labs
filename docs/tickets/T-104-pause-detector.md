# T-104 · Pause detector — "ask now"
**Lane B · depends on: T-103, T-107**

Decide *when* the agent may speak. All thresholds from `.env`:

- screen still for `PAUSE_SCREEN_STILL_SEC` (no accepted event, no frame change)
- mic silent for `PAUSE_SILENCE_SEC` (from the ElevenLabs VAD / Scribe turn signal)
- at least `ASK_COOLDOWN_SEC` since the last question
- fewer than `MAX_LIVE_QUESTIONS` asked this session

Only when all four hold does the server push an `ask_now` signal to the agent, carrying the *subject* it
should ask about (T-108 picks it). Suppress entirely while the expert is mid-sentence or mid-typing.

This is the ticket the challenge is won or lost on — "interrupts mid-typing" is listed in the brief as a
weak submission. Instrument it: log every near-miss with which condition blocked it, so the thresholds
can be tuned from real runs rather than guessed.

**Acceptance:** across three recorded sessions, zero questions land while the expert is typing or
speaking, and at least three land per ten minutes.
