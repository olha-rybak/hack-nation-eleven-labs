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

1. Create a blank agent. **LLM:** Claude Sonnet 5.5 (or Haiku 4.5), **reasoning effort: Low**:
   turn-taking latency matters more than depth here.
2. **First message:** empty, so the tutor waits until a cue arrives. **System prompt:** paste
   `prompts/tutor/system.md`, and paste it again whenever that file changes; the browser does not
   override the prompt.
3. **Tools → Add tool → Client**, both with *Wait for response* on:
   - `lookup_guardrail`, parameter `guardrail_id` (string, required): "Returns the exact statement
     and the expert's verbatim words for a guardrail id from the Work Map. Use it before quoting a
     guardrail, so the quote is exact."
   - `lookup_step`, parameter `index` (integer, required): "Returns the exact decision and the
     expert's verbatim words for a step of the Work Map, by its step number."
4. **Tools → System tools:** turn on **Skip turn** only. The prompt tells the tutor to call it and
   stay quiet when the new hire's turn has no words.
5. **Settings → Advanced:**
   - *Eagerness:* **Patient**, so a short pause does not end the new hire's turn.
   - *Take turn after silence:* **-1** (disabled). The tutor never takes a turn just because the new
     hire is quiet; it speaks on cues only.
   - *Max conversation duration:* **1800** s. The default 600 s cuts the voice off in the middle of
     a longer practice.
   - *Client events:* add **`vad_score`**, so the browser can tell the pause detector when the new
     hire is talking (`useTutor.ts`).
6. **Security:** authentication off (public agent). Copy the agent ID into the repo-root `.env` as
   `ELEVENLABS_TUTOR_AGENT_ID` (and into the deployed server's environment). The browser reads it from
   `GET /config`.
7. **Publish.** Changes stay a draft until then.

## Check it

1. Seed the demo expert session: `python3 scripts/seed_demo_session.py` (confirmed returns-desk Work
   Map plus its screenshots), then open `/teach/demo-brandt`.
2. *Open training case* opens the returns desk as the new hire (`/shop?case=training`). Share that tab.
   The voice dock shows *Listening* once the agent is connected.
3. Open RMA-2051, the case the expert never showed: a 279 EUR soundbar that arrived in a dented box,
   so it is both a carrier claim and over the supervisor limit. Choose *Refund*. The tutor should
   name only what you did and ask, e.g. "You're setting the resolution on RMA-2051 to Refund.
   M. Brandt would stop here. Why do you think?". Answer out loud; it should confirm and end with
   M. Brandt's exact words. Changing it to *Carrier claim* and escalating resolves both rules.

## Not done yet

- Acceptance (all three modes in a live run, every intervention ending with a verbatim quote) and the
  second-machine run with an intervention within ~2 s of the edit.
