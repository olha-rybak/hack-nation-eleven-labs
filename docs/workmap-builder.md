# Work Map builder and gap finder (T-201)

On End task, the session log (events + transcript) becomes a **draft Work Map** and a **ranked gap
list**. The debrief (T-203) asks the gaps; when every step and guardrail has the expert's words, the
draft converts to a real `WorkMap` (T-200 schema).

## API

- `POST /sessions/{id}/workmap/draft` builds the draft, saves it as `workmap_draft.json` in the
  session folder, returns it. Takes ~10 s. 502 if the LLM returns nothing usable.
- `GET /sessions/{id}/workmap/draft` returns the saved draft.
- Building the draft also closes the gaps an **earlier session** already answered (T-110 knowledge
  graph, `workmap/known.py`, prompt `prompts/debrief/known.md`). Candidates are facts about the same
  things on screen with a quote from another session; one model call judges which fact answers which
  gap. A closed gap gets `fact_id` and an answer with `source: "earlier_session"`, so the debrief
  does not ask it. If that call fails, the draft is still saved and the debrief asks them.
- `POST /sessions/{id}/debrief/answer` closes one gap (T-203) and returns the updated draft.
  Body `{"gap_id": "gap-2", "text": "<the expert's words>", "ts_ms": 512000}`, or
  `{"gap_id": "gap-2", "declined": true}` when the expert would rather not answer. The answer
  becomes a `Quote` with `source: "debrief"`; it fills the reason of the gap's guardrail, or else its
  step, if that reason is still missing, and is added to the knowledge graph (T-110).
  404 unknown session, draft or gap; 409 gap already closed; 422 no text or `ts_ms`.
- `GET /sessions/{id}/debrief` → `{next, queue, left, done, guardrail_needed}`: the open gaps with
  importance ≥ `DEBRIEF_MIN_IMPORTANCE` (default 3) in asking order, `next` = the one to ask now, `left`
  = the "3 gaps left" counter. If the live session asked no guardrail question (`guardrail` in the
  pause log), guardrail gaps go first; if the draft has none, a general one (`gap-guardrail`) is added.
- `POST /sessions/{id}/debrief/finish` ends the debrief, done or stopped early, and saves
  `workmap.json` → `{workmap, left_out}`. Steps and guardrails the expert never explained are left out
  of the map (their titles in `left_out`), not invented. 409 if no step was explained at all.
- `GET /sessions/{id}/workmap` the saved Work Map, 404 until the debrief finishes. The `/map/:id`
  page reads this.

Draft shape (`apps/server/apprentice/workmap/draft.py`): same as the Work Map, plus

- `steps[].reason` and `guardrails[].reason` may be `null` = not explained yet.
- `steps[].event_ids` = the session events the step was built from.
- `gaps[]`, most important first: `id`, `kind` (`no_reason` | `no_threshold` | `unseen_branch` |
  `inconsistency`), `step_index`, `guardrail_id`, `question` (one spoken sentence, ready to ask),
  `why_it_matters`, `importance` 1-5, `status` (`open` | `answered` | `declined`), `answer`
  (the debrief `Quote`, once answered).

`DraftWorkMap.to_workmap()` raises until every reason is filled.

## Voice debrief (T-203)

`/debrief/:id` → **Start debrief** opens an ElevenLabs conversation (`useDebriefVoice.ts`) with
`ELEVENLABS_DEBRIEF_AGENT_ID`, or the interviewer agent when that is empty, and
`prompts/debrief/system.md` as a prompt override (enable *System prompt* and *First message*
overrides in the agent's Security tab). The page cues one gap at a time:

```
NEXT_GAP
Gap: <question>
About: <step title>: <decision>
Why: <why it matters>
```

The agent asks it; if the answer is vague it asks one follow-up. Its next line closes the gap
(`debrief/turns.ts`): an acknowledgement = answered (all expert lines since the question are the
answer), "Okay, skipping that one." = declined, "Okay, let's stop here." = stop. The page posts
the answer, fetches the next gap, and when none is left sends `DEBRIEF_DONE`; after the closing line
it saves the Work Map and opens `/map/:id` (the teach-back, T-204, goes here once it exists).
**Skip this question** declines the current gap; **Stop here** saves the Work Map at any point.

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
