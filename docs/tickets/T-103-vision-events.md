# T-103 · Frames → events (vision slot)
**Lane B · depends on: T-001**

`POST /ingest/frame` persists the frame and, when it differs from the last keyframe, sends the previous
and current frame to slot 0 with the environment brief (T-109) in context. The model returns **events**,
not prose. Typed schema:

```python
Event(ts_ms, kind: Literal["open","edit","navigate","save","hold","route","unknown"],
      entity: str,         # "invoice 4471"
      field: str | None,   # "cost center"
      before: str | None, after: str | None,
      confidence: float, frame_ref: str)
```

Dedupe against the previous event — a field being typed character by character is one edit, not twelve.
Drop anything below a confidence floor rather than emitting a guess: a wrong event poisons both the
agent's question and the Work Map.

**Acceptance:** replaying a recorded 5-minute session of the fake ERP yields an event list a teammate can
read as a correct account of what happened, with no more than one spurious event.
