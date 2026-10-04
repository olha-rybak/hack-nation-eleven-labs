# Backend API (lane B) — what the web app and the agent proxy talk to

Server: `apps/server`, `http://127.0.0.1:8001` (also serves the interviewer test page at `/`).
Run from `apps/server`: `uvicorn apprentice.main:app --port 8001`.
The vision model runs separately in llama-server on `:8080`; see `.env.example`.

## Health
`GET /health` → `{"server": "ok", "model": "ok" | "down", "presidio": "on" | "text-only" | "off"}` (`text-only`: Tesseract missing, frames are stored unmasked)

## Sessions
- `POST /sessions` body `{"session_id"?: str, "role"?: "interviewer"|"tutor"}` → `{"session_id"}`.
  Optional: `/ingest/frame` auto-creates an unknown session.
- `GET /sessions/{id}` → meta. `GET /sessions/{id}/events`, `GET /sessions/{id}/transcript`.
- `POST /sessions/{id}/transcript` body `{"speaker", "ts_ms", "text"}` → appended and broadcast.
- `GET /sessions/{id}/frames/{name}` → the stored JPEG (`name` from an event's `frame_ref`).
- Session ids: `[A-Za-z0-9_-]{1,64}`.

## Frames in (T-101 → T-103)
`POST /ingest/frame?session_id=<id>&frame_ts=<ms since session start>`
- Body = **raw JPEG bytes** (`Content-Type: image/jpeg`) for a changed frame:
  `fetch(url, {method: "POST", body: jpegBlob})`. Returns 202 `{"frame_ref": "frames/0000012000.jpg"}`.
- Body = **empty** for "frame existed but unchanged" → `{"frame_ref": null}`.
- The first frame of a session is the baseline; events start from the second changed frame.

## Live channel
`WS /ws/session/{id}` — first message `{"type": "snapshot", "data": {"events": [...], "transcript": [...]}}`,
then `{"type": "event" | "transcript" | ..., "data": ...}`.

**Events are upserts by `id`.** Typing in one field is merged into one edit: the same `id` is sent again
with a newer `after`. Clients must replace by `id`, not append.

## Event shape (T-103)
```json
{"id": "a1b2c3d4e5f6", "ts_ms": 12000, "kind": "edit", "entity": "invoice 4471",
 "field": "Cost center", "before": "4711", "after": "0400", "confidence": 0.9,
 "frame_ref": "frames/0000012000.jpg"}
```
`kind`: `open | edit | navigate | save | hold | route | unknown`. Events below `EVENT_MIN_CONFIDENCE`
are dropped, not guessed.

## When the agent may speak (T-104)
The server, not the agent, decides. It pushes over the session websocket:
```json
{"type": "ask_now", "data": {"subject": "invoice 4471: Cost center changed from '4711' to '0400'",
 "event_id": "a1b2c3d4e5f6", "guardrail": false, "question_index": 1, "budget": 5,
 "known": [{"id": "f3e1c0a9b2d", "text": "Why 0400? \"Over 5,000 it's capex.\" (Anna, 2026-10-04)"}]}}
```
`known` is what the expert already told us about the subject in earlier sessions (T-110,
[knowledge-graph.md](knowledge-graph.md)); send it to the agent with the cue. It may be empty.
`guardrail: true` means ask about the limit, exception or stop-and-ask behind the subject. A hold or
route event is always one. Every session gets at least one: if none has been asked by question
`GUARDRAIL_BY_QUESTION`, that question is forced onto a guardrail. This is tracked per session and
rebuilt from the pause log on restart.
It fires only when **all** hold: screen still `PAUSE_SCREEN_STILL_SEC` (no changed frame, no new event),
user silent `PAUSE_SILENCE_SEC`, agent not speaking, `ASK_COOLDOWN_SEC` since the last ask, under
`MAX_LIVE_QUESTIONS`, and there is an un-asked event to ask about.

The browser must report voice state on every change, or the detector assumes silence:
`POST /sessions/{id}/signals` body `{"user_speaking"?: bool, "agent_speaking"?: bool}` → 204.
Sources: ElevenLabs SDK `onModeChange` (agent speaking/listening) and a VAD on the user's mic.
If the user starts speaking right after an `ask_now` arrives, drop the cue rather than talk over them.

- `POST /sessions/{id}/end` stops the ask-now loop (End task).
- `GET /sessions/{id}/pause-log` lists every blocker-set change (`near_miss: true` = one condition
  short) and every `ask_now`. Tune the thresholds in `.env` from this, not by guessing.

## Interviewer test page (`/events`)
`static/interviewer.html` polls `GET /events?since=n` and forwards new events to the ElevenLabs agent
(see [interviewer-agent.md](interviewer-agent.md)). These endpoints read and write session `live`
(`?session=` to change it), so events from `/ingest/frame?session_id=live` reach the page unchanged.
- `POST /events` one event or a list; validated as the event shape above (an `id` is added if missing).
- `GET /events?since=n` events from index n. A merged edit updates its earlier position in place.
- `DELETE /events` archives the session as `live-<timestamp>` and starts empty. Nothing is deleted.

## Off the record (T-105 / T-400)
`POST /sessions/{id}/off-the-record` body optional `{"seconds": float}` (default
`OFF_THE_RECORD_WINDOW_SEC`) → `{"from_ts_ms": 30000, "frames": 12, "events": 3, "transcript": 5,
"deleted_event_ids": ["a1b2c3d4e5f6"], "reverted_events": [<event>, ...]}`.

Deleted from disk, not flagged: frame lines and their JPEGs, event lines, transcript lines with
`ts_ms >= from_ts_ms`, and pause-log `ask_now` entries for any event changed inside the window (their
subject quotes the value). An event edited both before and after the cutoff reverts to its last
version before it and is returned in `reverted_events`. The in-memory keyframe and any
in-flight vision call for the session are dropped first.

Every connected client then gets `{"type": "deleted", "data": <the result above>}`: remove transcript
lines and frames with `ts_ms >= from_ts_ms`, events whose `id` is in `deleted_event_ids`, and replace
each event in `reverted_events` by `id`.

The window is measured on the session's clock, the latest `ts_ms` among frame ticks, transcript lines
and events, not wall time. The browser must keep sending empty-body frame ticks while the screen is
unchanged, or the window ends at the last activity and covers the wrong stretch.
