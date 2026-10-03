# T-200 · Work Map schema
**Lane A + B · depends on: T-105**

The contract every downstream module reads. `apps/server/apprentice/workmap/schema.py`, mirrored in
`apps/web/src/types/workmap.ts`.

```python
WorkMap(id, session_id, title, created_at, confirmed_at | None,
        steps: list[Step], guardrails: list[Guardrail], open_questions: list[str])

Step(index, title,                    # "Code the invoice to a cost center"
     frame_ts: int, frame_ref: str,   # the screen moment
     decision: str,                   # "Re-coded from opex (4711) to capex (0400)"
     reason: Quote,                   # the expert's own words
     guardrail_ids: list[str],
     is_judgment_call: bool)

Guardrail(id, kind: Literal["limit","exception","stop_and_ask"],
          statement: str,             # "No asset number, no capex booking"
          reason: Quote, step_index: int,
          check: GuardrailCheck | None)   # machine-evaluable form, see T-300

Quote(text, speaker, ts_ms, source: Literal["live_question","debrief","narration"])
```

Enforce in validation, not by convention: **every** `Step` and **every** `Guardrail` carries a
`frame_ts` and a non-empty `Quote`. A step without provenance fails validation rather than rendering
without a citation — the brief requires that every step and guardrail links to a screen moment and the
expert's own words, and a silently uncited step is exactly the "summary written from the transcript"
failure mode.

**Acceptance:** schema round-trips through JSON; a fixture Work Map missing a quote fails validation with
a message naming the step.
