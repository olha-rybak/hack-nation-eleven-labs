# Interviewer agent (MVP skeleton)

Screen events in, one spoken question out. Tickets: T-107 (agent), T-106 (how events reach it),
T-108 (later: better question choice).

## How it fits together

```
vision step (teammate) --POST /events--> FastAPI (apps/server)
                                            | GET /events?since=n (polled every 1s)
                                            v
                          test page (browser, @elevenlabs/client)
             sendContextualUpdate("Screen event: ...")   -> silent background context
             sendUserMessage("ASK_NOW")  [Ask now button] -> agent asks one question
                                            |
                                            v
                 ElevenLabs agent, LLM = built-in Claude (no Anthropic key needed)
```

- The LLM runs inside ElevenLabs. We don't call Claude ourselves.
- Contextual updates don't make the agent speak; only a user message does. So events are sent as
  contextual updates, and the cue to ask is a user message `ASK_NOW`. Later the pause detector
  (T-104) sends that cue instead of the button.
- Our system prompt is sent as a session override, so the prompt stays a file in this repo.
- This differs from the original T-106 plan (custom-LLM proxy to a local model). The proxy isn't
  needed while ElevenLabs hosts the LLM.

## Files

| File | What |
|---|---|
| `apps/server/apprentice/prompts/interviewer/system.md` | Agent system prompt: stay silent, on ASK_NOW ask one question |
| `apps/server/apprentice/prompts/interviewer/ask_now.md` | The cue text sent as a user message |
| `apps/server/apprentice/static/interviewer.html` | Test page: connect, forward events, Ask now, transcript |
| `apps/server/apprentice/main.py` | `POST/GET/DELETE /events`, serves the page, prompts, fixtures |
| `apps/server/fixtures/events.json` | 10 hand-written events for the three-invoice task |

## ElevenLabs setup (dashboard, once)

1. Create an agent. **LLM:** Claude Haiku 4.5 or Sonnet 5.5 (lowest latency first; try Opus 5.5 if
   questions are weak). Keep reasoning/effort low; extra thinking delays turn-taking.
2. **First message:** empty. **System prompt:** paste `system.md` (used if overrides are off).
3. **Security tab:** enable overrides for *System prompt* and *First message*, so the page can send
   the repo prompt. Keep authentication off (public agent) for local testing.
4. **Tools tab → client tools** (both *wait for response* on):
   - `log_answer`: "Record the expert's answer to the question you just asked." Parameters:
     `question` (string, required: your question as asked), `answer` (string, required: the
     expert's answer in their own words), `about_event_id` (string, optional: the event the
     ASK_NOW was about).
   - `off_the_record`: "Delete the last stretch of the session when the expert asks to go off the
     record." No parameters.
5. **Advanced → client events:** enable `vad_score`, so the capture page can tell the pause
   detector when the expert is talking (T-104).
6. **Less sensitive to noise** (same for the debrief agent): in *Advanced*, set turn eagerness to
   *patient*, so a short pause or a sound doesn't end the expert's turn. If noise still triggers
   replies, turn off interruptions there too. The SDK can't set these from code.
7. **No "Are you still there?"** (same for the debrief and tutor agents): *Tools tab → Add tool →
   Skip Turn*, and in *Advanced* set *Take turn after silence* to 30 s, the maximum. The timeout
   can't be turned off, so after 30 s of silence the agent still gets a turn; the prompt tells it to
   call `skip_turn` and say nothing. Without the tool it can only fill the silence with words.
8. Copy the agent ID.

**Mic only for answers.** Both the capture page and the debrief keep the mic muted by default
(`apps/web/src/lib/micGate.ts`). Live, it opens once the agent has finished saying a line that ends in
`?`, and closes when the expert's answer arrives or after `ANSWER_WINDOW_SEC` (`.env`) without their
voice. In the debrief it opens after every agent line until the closing one, with no time limit.
While the mic is closed nothing reaches the agent, so:

- a sound can't interrupt the agent or start a reply;
- the pause detector gets no `user_speaking` from the expert, so a question can land while they talk
  to someone else (it still waits for the screen to be still);
- saying "off the record" or "pause" only works while the mic is open; the panel buttons always work.

The capture page (`apps/web/src/capture/useInterviewer.ts`) implements both tools. `log_answer` posts
to `/knowledge/answers`; if the agent never calls it, the page pairs question and answer from the
transcript instead, and each question is logged once either way.

## Run it

```bash
cd apps/server
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn apprentice.main:app --reload --port 8001
open http://localhost:8001/
```

The page fills the agent ID from `ELEVENLABS_INTERVIEWER_AGENT_ID` in the repo-root `.env`
(`?agent=<id>` overrides it).

On the page: **Start** (allow the mic) → **Send next sample event** a few times → **Ask now**. The
agent should ask one question naming something from the events, e.g. invoice 4471's cost center.
If Start fails with an override error, untick *repo prompt* or enable overrides (step 3).

Teammate's vision step posts real events the same way:
`curl -X POST localhost:8001/events -H 'content-type: application/json' -d '{"ts_ms":...}'`.

Tests: `.venv/bin/pytest -q`.

## Known issues

- The agent may still reply when the expert narrates; tune `system.md`.
