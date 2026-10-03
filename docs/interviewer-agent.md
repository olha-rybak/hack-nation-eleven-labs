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
4. Copy the agent ID.

## Run it

```bash
cd apps/server
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn apprentice.main:app --reload --port 8001
open http://localhost:8001/?agent=<AGENT_ID>
```

On the page: **Start** (allow the mic) → **Send next sample event** a few times → **Ask now**. The
agent should ask one question naming something from the events, e.g. invoice 4471's cost center.
If Start fails with an override error, untick *repo prompt* or enable overrides (step 3).

Teammate's vision step posts real events the same way:
`curl -X POST localhost:8001/events -H 'content-type: application/json' -d '{"ts_ms":...}'`.

Tests: `.venv/bin/pytest -q`.

## Not in the skeleton yet

- Sessions (one global event list in memory) — T-105.
- Pause detector sending ASK_NOW automatically — T-104.
- The agent may still reply when the expert narrates; tune `system.md` or handle in T-104.
- Client tools `log_answer`, `off_the_record` — T-107.
- Environment pack in the prompt — T-109.
