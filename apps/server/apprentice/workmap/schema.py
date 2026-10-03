"""Work Map schema (T-200).

Provenance is enforced here, not by convention: every step and guardrail must carry
a non-empty expert quote and a screen-moment reference, or the whole map is rejected
with a message naming the offender.

Quote emptiness is checked at WorkMap level (not on Quote itself) so the error can
name the step or guardrail it belongs to.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, computed_field, model_validator


class Quote(BaseModel):
    text: str  # verbatim, in the expert's language
    text_en: str | None = None  # T-601 translation; never replaces text
    speaker: str
    ts_ms: int = Field(ge=0)
    source: Literal["live_question", "debrief", "narration"]


class GuardrailCheck(BaseModel):
    """Machine-evaluable form, evaluated by T-300. `condition` syntax is T-300's concern."""

    trigger_kind: Literal["open", "edit", "navigate", "save", "hold", "route", "unknown"]
    entity_pattern: str  # regex matched against event.entity
    field: str | None = None
    condition: str
    severity: Literal["warn", "stop"]


class Step(BaseModel):
    index: int = Field(ge=0)
    title: str
    frame_ts: int = Field(ge=0)
    frame_ref: str
    decision: str
    reason: Quote
    guardrail_ids: list[str] = []
    is_judgment_call: bool = False


class Guardrail(BaseModel):
    id: str
    kind: Literal["limit", "exception", "stop_and_ask"]
    statement: str
    reason: Quote
    step_index: int
    frame_ts: int = Field(ge=0)
    frame_ref: str
    check: GuardrailCheck | None = None


class WorkMap(BaseModel):
    id: str
    session_id: str
    title: str
    created_at: datetime
    confirmed_at: datetime | None = None
    steps: list[Step]
    guardrails: list[Guardrail] = []
    open_questions: list[str] = []

    @model_validator(mode="after")
    def _validate_provenance_and_links(self) -> WorkMap:
        errors: list[str] = []

        for pos, step in enumerate(self.steps):
            label = f'step {step.index} "{step.title}"'
            if step.index != pos:
                errors.append(f"{label}: index must equal its position {pos}")
            if not step.reason.text.strip():
                errors.append(f"{label}: reason quote is empty")
            if not step.frame_ref.strip():
                errors.append(f"{label}: frame_ref is empty")

        seen: set[str] = set()
        for g in self.guardrails:
            if g.id in seen:
                errors.append(f"guardrail {g.id}: duplicate id")
            seen.add(g.id)

        step_indexes = {s.index for s in self.steps}
        for g in self.guardrails:
            label = f'guardrail {g.id} "{g.statement}"'
            if not g.reason.text.strip():
                errors.append(f"{label}: reason quote is empty")
            if not g.frame_ref.strip():
                errors.append(f"{label}: frame_ref is empty")
            if g.step_index not in step_indexes:
                errors.append(f"{label}: step_index {g.step_index} does not refer to a step")
            if g.check is not None:
                try:
                    re.compile(g.check.entity_pattern)
                except re.error as exc:
                    errors.append(
                        f"{label}: entity_pattern {g.check.entity_pattern!r} "
                        f"is not a valid regex ({exc})"
                    )

        for step in self.steps:
            for gid in step.guardrail_ids:
                if gid not in seen:
                    errors.append(f'step {step.index} "{step.title}": unknown guardrail id "{gid}"')

        if errors:
            raise ValueError("; ".join(errors))
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def summary(self) -> dict[str, int]:
        return {
            "steps": len(self.steps),
            "judgment_calls": sum(1 for s in self.steps if s.is_judgment_call),
            "guardrails": len(self.guardrails),
        }

    @property
    def is_confirmed(self) -> bool:
        return self.confirmed_at is not None

    def guardrail(self, guardrail_id: str) -> Guardrail:
        for g in self.guardrails:
            if g.id == guardrail_id:
                return g
        raise KeyError(guardrail_id)

    def steps_for(self, guardrail_id: str) -> list[Step]:
        """Steps governed by a guardrail: those listing it, plus its own step_index."""
        g = self.guardrail(guardrail_id)
        return [s for s in self.steps if guardrail_id in s.guardrail_ids or s.index == g.step_index]


def load_workmap(path: str | Path) -> WorkMap:
    return WorkMap.model_validate_json(Path(path).read_text(encoding="utf-8"))


def dump_workmap(wm: WorkMap, path: str | Path) -> None:
    Path(path).write_text(wm.model_dump_json(indent=2) + "\n", encoding="utf-8")
