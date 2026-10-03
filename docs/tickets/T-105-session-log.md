# T-105 · Session log + live channel
**Lane B · owner: Hlib · depends on: T-001**

Durable, inspectable session state under `data/sessions/<session_id>/`: `frames/` as JPEGs named by
timestamp, `events.jsonl`, `transcript.jsonl` (speaker, ts_ms, text), `meta.json`. Append-only, so a
crashed browser loses nothing.

A websocket (`/ws/session/<id>`) broadcasts events, transcript lines and agent state to the capture UI
and later the tutor UI.

Implement `delete_window(session_id, seconds)` here — off-the-record truncates frames, events and
transcript together, and this is the one place in the codebase allowed to remove session data.

**Acceptance:** killing and restarting the server mid-session loses nothing already written; two browser
tabs on the same session see identical feeds.
