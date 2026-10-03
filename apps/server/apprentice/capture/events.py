"""Screen events: the vision slot's output, and the only screen content the agent ever sees."""

import json
import re
import uuid
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

EventKind = Literal["open", "edit", "navigate", "save", "hold", "route", "unknown"]


class Event(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    ts_ms: int
    kind: EventKind
    entity: str
    field: str | None = None
    before: str | None = None
    after: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    frame_ref: str
    fields: dict[str, str] | None = None  # open: visible field values, label -> value


class RawEvent(BaseModel):
    """One event as the model writes it, before we stamp time, frame and id."""

    kind: EventKind
    entity: str
    field: str | None = None
    before: str | int | float | None = None
    after: str | int | float | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    fields: dict[str, str | int | float | None] | None = None


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def parse_model_events(text: str) -> list[RawEvent]:
    """Pull {"events": [...]} out of a model reply; tolerate code fences, thinking and stray prose.

    Malformed individual events are skipped, not fatal: one bad item shouldn't drop the frame.
    """
    text = _THINK.sub("", text)
    decoder = json.JSONDecoder()
    for start in (m.start() for m in re.finditer(r"\{", text)):
        try:
            obj, _ = decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("events"), list):
            out = []
            for item in obj["events"]:
                try:
                    out.append(RawEvent.model_validate(item))
                except ValidationError:
                    continue
            return out
    return []


def _norm(s: str | None) -> str:
    return (s or "").strip().casefold()


def _same_target(a: Event | RawEvent, b: Event | RawEvent) -> bool:
    return _norm(a.entity) == _norm(b.entity) and _norm(a.field) == _norm(b.field)


def _str(v: str | int | float | None) -> str | None:
    return None if v is None else str(v)


def to_events(
    raw: list[RawEvent], last: Event | None, ts_ms: int, frame_ref: str, min_confidence: float
) -> list[Event]:
    """Stamp raw model events and dedupe them against the session's last event.

    Returns the events to append. An event reusing `last.id` is a merge: the store folds by id, so
    it replaces the earlier one. Typing a field character by character becomes one edit whose
    `before` is the value before the first keystroke.
    """
    out: list[Event] = []
    for r in raw:
        if r.confidence < min_confidence:
            continue
        ev = Event(
            ts_ms=ts_ms,
            kind=r.kind,
            entity=r.entity.strip(),
            field=r.field,
            before=_str(r.before),
            after=_str(r.after),
            confidence=r.confidence,
            frame_ref=frame_ref,
            fields={k: _str(v) or "" for k, v in r.fields.items()} if r.fields else None,
        )
        prev = out[-1] if out else last
        if prev is not None and prev.kind == ev.kind and _same_target(prev, ev):
            if ev.kind == "edit":
                if _norm(prev.after) == _norm(ev.after):
                    continue  # model re-reported the same value
                ev = ev.model_copy(update={"id": prev.id, "before": prev.before})
                if out and out[-1].id == prev.id:
                    out[-1] = ev
                    continue
            else:
                continue  # same open/save/hold/... on the same thing twice in a row
        out.append(ev)
    return out
