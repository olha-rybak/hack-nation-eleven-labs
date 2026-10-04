# Tutor agent (T-302)

The second ElevenLabs agent, on `/teach`. It sits next to the new hire, stays quiet, and speaks on
cues: Predict before a decision, Explain a step in the expert's words, Intervene before a guardrail
is broken. It never states the rule first and ends every intervention with the expert's exact words.

## How it fits together

```
tutor session (POST /sessions role=tutor, work_map_id=<expert session>)
   frames -> vision -> events -> guardrail engine (T-300) -> guardrail_hit / guardrail_resolved
                                   |  + known facts from the knowledge graph (T-110)
                                   v
          WS /ws/session/{id}  ->  browser: apps/web/src/teach/useTutor.ts
     Work Map brief, screen events -> sendContextualUpdate (silent)
     CASE_OPENED / PAUSE / STOP / WARN / RESOLVED -> sendUserMessage (the agent speaks)
     client tools lookup_guardrail, lookup_step -> exact wording from the loaded Work Map
```

- A `stop` hit is sent the moment it arrives; it does not wait for the pause detector.
- `PAUSE` comes from the pause detector's `ask_now` and is skipped while an intervention is open.
- The agent picks Predict, Explain or silence on `PAUSE` itself (prompt).
- Cue formats: `apps/web/src/teach/tutorCues.ts`, described in the prompt.

## Files

| File | What |
|---|---|
| `apps/server/apprentice/prompts/tutor/system.md` | System prompt: the three modes and the cues |
| `apps/server/apprentice/guardrails/live.py` | Live guardrails and `known` facts on each hit (T-300) |
| `apps/web/src/teach/useTutor.ts` | Connects the agent to a tutor session |
| `apps/web/src/teach/tutorCues.ts` | Cue texts and the client tool answers |

## ElevenLabs setup (dashboard, once)

1. Create an agent. **LLM:** Claude Sonnet 5.5 or Haiku 4.5, low reasoning effort (turn-taking
   latency matters more than depth here).
2. **First message:** empty. **System prompt:** paste `prompts/tutor/system.md`.
3. **Tools:** add two client tools, both "wait for response":
   - `lookup_guardrail`, parameter `guardrail_id` (string): "Exact statement and the expert's words
     for a guardrail id from the Work Map."
   - `lookup_step`, parameter `index` (number): "Exact decision and the expert's words for a step."
4. Keep authentication off (public agent) for local testing. Copy the agent ID into the repo-root
   `.env` as `ELEVENLABS_TUTOR_AGENT_ID`. The browser reads it from `GET /config`.

## Not done yet

- `/teach` does not start a tutor session or use `useTutor` yet (T-301 wiring).
- Acceptance (all three modes in a live run, every intervention ending with a verbatim quote) needs
  the agent created as above.
