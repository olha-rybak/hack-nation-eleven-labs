# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **AI Apprentice** — our entry for Hack-Nation's 7th Global AI Hackathon, Challenge 01, powered by
ElevenLabs. Brief: `file.pdf`. Architecture diagram: `Apprentice Pipeline.html` (open it in a browser;
boxes are clickable and jump to their description).

An expert shares their screen and does a real task in a fake ERP. A voice agent watches, stays quiet
while they work, and asks *why* at natural pauses. Afterwards a debrief closes the gaps and produces a
**Work Map** — a timeline where every step carries the screen moment, the decision, the expert's own
words and the guardrails. The Work Map then becomes a voice tutor that coaches a new hire on their own
screen.

The judging bar, in one line: *if a new person could not do the task from what it learned, it is not an
AI Apprentice.* A recorder or a transcript summarizer scores as weak.

## Repo layout

```
apps/web/              Vite + React + TS. Capture UI (screen share + side panel),
                       Work Map timeline, tutor overlay, and the fake ERP.
apps/server/           FastAPI. Vision loop, ElevenLabs custom-LLM proxy, session
  apprentice/          store, Work Map builder, Obsidian export, Presidio redaction.
config/environment/    The environment config pack the model reads before a session
                       (glossary, written rules, captioned screenshots, today's task).
data/sessions/         Per-session frames, events, transcript. Gitignored — screen content.
docs/tickets/          Build tickets. See docs/tickets/README.md for the board.
```

## Commands

The scaffolding is created by tickets T-001/T-002; until those land, these are the conventions to
*write toward*, not commands that already work.

```bash
# backend (from apps/server)
uv sync                                   # or: pip install -e ".[dev]"
uv run uvicorn apprentice.main:app --reload --port 8000
uv run pytest                             # all tests
uv run pytest tests/test_pause.py::test_cooldown -x   # one test
uv run ruff check . && uv run ruff format .

# frontend (from apps/web)
npm install
npm run dev                               # Vite dev server, proxies /api -> :8000
npm run build && npm run typecheck
npm run lint

# local model — must be running before capture works
llama-server -m models/nemotron-omni.gguf --parallel 2 --port 8080 --host 127.0.0.1
```

`.env.example` is the source of truth for configuration; copy it to `.env`. Every tuning constant in the
capture loop (fps, pause thresholds, cooldown, question budget) lives there — never hardcode them, the
demo is tuned by editing `.env` between runs.

## Architecture

### One model, two slots

A single local Nemotron Omni runs in `llama-server --parallel 2`. Slot 0 does **vision**: it receives
consecutive frames and returns *events*, not descriptions (`cost center 4711 → 0400`, `invoice 4471
opened`). Slot 1 does **agent turns**: it writes what the voice agent speaks, from the latest frames
plus the event log. Never send raw video anywhere — frames in, events out, and only events reach the
agent's context.

ElevenLabs owns only the voice: speech-to-text (Scribe v2 Realtime), turn-taking, TTS. The agent is
configured with a **custom LLM endpoint** pointing at `POST /agent/llm` on our FastAPI server, which is
OpenAI-chat-completions-shaped and forwards to slot 1 with the session's event log injected. This is the
seam that makes "the agent knows what is on screen" work — if you change the event schema, you change
this proxy.

### Who decides to speak

The agent does **not** decide when to talk. The `PauseDetector` on the server does: screen still for
`PAUSE_SCREEN_STILL_SEC`, mic silent for `PAUSE_SILENCE_SEC`, past the `ASK_COOLDOWN_SEC` cooldown, and
under the `MAX_LIVE_QUESTIONS` budget. Only then does it fire a client tool that tells the agent *ask
now*. Interrupting mid-typing is the single most visible way to fail this challenge; the budget is
deliberately small (3–5 questions per ten minutes) because the rest waits for the debrief.

### Flow of a session

1. **Prime** — the model reads `config/environment/` once and writes an environment brief that stays in
   its context. Consequence: it names fields correctly and only asks about what the docs *don't* cover.
   A question the glossary already answers is a bug.
2. **Capture** — frame sampler at `FRAME_FPS`, keeps every frame with its timestamp, forwards only
   changed frames to slot 0. Events + timestamped transcript + frames accumulate in the session log.
3. **Map** — on *End task*, the debrief agent asks the questions it still has (≥3, none answered during
   the task), then teaches the process back until the expert confirms. An LLM pass merges events,
   transcript and answers into Work Map JSON.
4. **Teach** — the tutor reuses the *same capture loop* on the new hire's screen with the Work Map
   loaded, checks each event against the guardrails, and interrupts before a wrong save, replaying the
   expert's frame.

### Work Map is the contract

Everything downstream reads Work Map JSON — the timeline UI, the Obsidian export, the tutor's knowledge
base, the agent-ready guardrails export. Every step and every guardrail **must** carry a `frame_ts` and
a verbatim `quote` from the expert; a step without provenance cannot be shown in the timeline or used by
the tutor. Treat the schema (`apps/server/apprentice/workmap/schema.py`) as the change-with-care file.

### Privacy, and why it is a feature

*Off the record* deletes the last `OFF_THE_RECORD_WINDOW_SEC` from the session log — frames, events and
transcript — not just hides it. Presidio redacts PII from transcripts and frames before anything is
persisted. Question 5 of the Apprentice Test is about trust, so this is demoed, not just implemented.

## Working on this

- **Ticket-driven.** `docs/tickets/` holds the board. Each ticket names its owner lane (A = web app and
  fake ERP, B = local model and backend, C = prompts, agent and demo), its dependencies and its
  acceptance check. Pick up a ticket, don't invent parallel work.
- **The demo is the deliverable.** Three required moments must be rehearsable end to end: three live
  questions (one about a guardrail), a debrief with three new questions plus a confirmed teach-back, and
  a tutor catching a wrong decision on a case the expert never showed. Work that doesn't move one of
  those three is below the line until they all pass.
- Prompts live in `apps/server/apprentice/prompts/` as files, not inline strings — they are tuned
  constantly during the hackathon and need to be diffable.
- The running example is three supplier invoices: one over the €5,000 capex line, one from a supplier
  that double-bills in December, one from the Czech subsidiary needing a second approval.
