# Work Map builder and gap finder (T-201)

On End task, the session log (events + transcript) becomes a **draft Work Map** and a **ranked gap
list**. The debrief (T-203) asks the gaps; when every step and guardrail has the expert's words, the
draft converts to a real `WorkMap` (T-200 schema).

## API

- `POST /sessions/{id}/workmap/draft` builds the draft, saves it as `workmap_draft.json` in the
  session folder, returns it. Takes ~10 s. 502 if the LLM returns nothing usable.
- `GET /sessions/{id}/workmap/draft` returns the saved draft.
- `POST /sessions/{id}/debrief/answer` closes one gap (T-203) and returns the updated draft.
  Body `{"gap_id": "gap-2", "text": "<the expert's words>", "ts_ms": 512000}`, or
  `{"gap_id": "gap-2", "declined": true}` when the expert would rather not answer. The answer
  becomes a `Quote` with `source: "debrief"`; it fills the reason of the gap's guardrail, or else its
  step, if that reason is still missing, and is added to the knowledge graph (T-110).
  404 unknown session, draft or gap; 409 gap already closed; 422 no text or `ts_ms`.

Draft shape (`apps/server/apprentice/workmap/draft.py`): same as the Work Map, plus

- `steps[].reason` and `guardrails[].reason` may be `null` = not explained yet.
- `steps[].event_ids` = the session events the step was built from.
- `gaps[]`, most important first: `id`, `kind` (`no_reason` | `no_threshold` | `unseen_branch` |
  `inconsistency`), `step_index`, `guardrail_id`, `question` (one spoken sentence, ready to ask),
  `why_it_matters`, `importance` 1-5, `status` (`open` | `answered` | `declined`), `answer`
  (the debrief `Quote`, once answered).

`DraftWorkMap.to_workmap()` raises until every reason is filled.

## Provenance by construction

The LLM never writes the expert's words. It only picks transcript line numbers and event numbers;
the builder copies the text verbatim and takes `frame_ts` / `frame_ref` from the decisive event
(edit/hold/route before save before open). Agent lines and the `ASK_NOW` cue are never quotes.
A guardrail with no expert line behind it is dropped. A guardrail condition that the T-300
evaluator rejects is removed and becomes a `no_threshold` gap.

## Model

Set in `.env`:

- Claude (default): `ANTHROPIC_API_KEY=...`, `MAP_LLM_MODEL=claude-opus-5-5`, `MAP_LLM_EFFORT=high`.
  Requests opt into Anthropic's server-side fallback (`fallbacks: "default"`), so a refused request is
  re-run on another model instead of failing. Roughly $0.10 per draft.
- `MAP_LLM_PROVIDER=local`: the llama-server used for vision, free. Works, but the 8B model misses
  guardrails and rarely writes checkable conditions; use it for wiring tests.

Prompt: `apps/server/apprentice/prompts/workmap/draft.md`.

## Depends on

- The transcript reaching the server: the interviewer page must `POST /sessions/live/transcript`
  for each expert and agent message (`onMessage`), or the draft has no reasons to quote.
