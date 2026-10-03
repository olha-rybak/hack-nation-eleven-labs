# T-107 · ElevenAgents interviewer — voice setup
**Lane C · depends on: T-106**

Create the interviewer agent in ElevenLabs: Expressive Mode, a curious and patient voice, Scribe v2
Realtime for transcription, custom LLM pointed at our proxy. Register client tools:

- `ask_now(subject)` — server-initiated cue that it may speak
- `log_answer(question, answer, about_event_id)` — writes the expert's words back to the session log
- `off_the_record()` — voice-triggered equivalent of the button

`log_answer` also feeds the knowledge graph (T-110). Until it exists, the test page posts each
question and answer pair itself, so T-110 is not blocked on this tool.

Configure it to stay silent by default. The agent's standing instruction is that it does **not**
volunteer speech; it speaks when cued, and otherwise listens.

**Acceptance:** in a live call the agent stays quiet through two minutes of narration, then speaks within
about a second of an `ask_now`, and the expert's answer lands in `transcript.jsonl` attributed correctly.
