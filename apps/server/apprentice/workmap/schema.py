"""Work Map: the contract every downstream module reads (T-200).

Mirrored by hand in apps/web/src/types/workmap.ts. Change both in the same PR.

Provenance is enforced here, not by convention: every step and every guardrail
must point at a screen moment (frame_ts) and carry the expert's own words
(a non-empty Quote). A map that fails this cannot be rendered or taught from.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    ModelWrapValidatorHandler,
    ValidationError,
    model_validator,
)


def _not_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be empty")
    return value


NonBlank = Annotated[str, AfterValidator(_not_blank)]
FrameTs = Annotated[int, Field(ge=0, description="ms since session start")]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _describe(exc: ValidationError) -> str:
    parts = []
    for err in exc.errors():
        where = ".".join(str(p) for p in err["loc"])
        parts.append(f"{where}: {err['msg']}" if where else err["msg"])
    return "; ".join(parts)


class Quote(_Model):
    text: NonBlank
    speaker: NonBlank
    ts_ms: FrameTs
    source: Literal["live_question", "debrief", "narration"]


class GuardrailCheck(_Model):
    """Machine-evaluable form of a guardrail, evaluated by the T-300 engine."""

    trigger_kind: str
    entity_pattern: str
    field: str
    condition: str
    severity: Literal["warn", "stop"]


class Step(_Model):
    index: Annotated[int, Field(ge=1)]
    title: NonBlank
    frame_ts: FrameTs
    frame_ref: NonBlank
    decision: NonBlank
    reason: Quote
    guardrail_ids: list[str] = []
    is_judgment_call: bool = False

    @model_validator(mode="wrap")
    @classmethod
    def _name_the_step(
        cls, data: Any, handler: ModelWrapValidatorHandler[Self]
    ) -> Self:
        try:
            return handler(data)
        except ValidationError as exc:
            label = _label(data, "index", "step")
            raise ValueError(f"{label} is invalid: {_describe(exc)}") from None


class Guardrail(_Model):
    id: NonBlank
    kind: Literal["limit", "exception", "stop_and_ask", "never_do"]
    statement: NonBlank
    frame_ts: FrameTs
    reason: Quote
    step_index: Annotated[int, Field(ge=1)]
    check: GuardrailCheck | None = None

    @model_validator(mode="wrap")
    @classmethod
    def _name_the_guardrail(
        cls, data: Any, handler: ModelWrapValidatorHandler[Self]
    ) -> Self:
        try:
            return handler(data)
        except ValidationError as exc:
            label = _label(data, "id", "guardrail")
            raise ValueError(f"{label} is invalid: {_describe(exc)}") from None


def _label(data: Any, key: str, noun: str) -> str:
    if not isinstance(data, dict):
        return noun
    ident = data.get(key)
    title = data.get("title") or data.get("statement")
    label = f"{noun} {ident}" if ident is not None else noun
    return f"{label} ({title!r})" if title else label


class WorkMap(_Model):
    id: NonBlank
    session_id: NonBlank
    title: NonBlank
    created_at: datetime
    confirmed_at: datetime | None = None
    steps: list[Step] = Field(min_length=1)
    guardrails: list[Guardrail] = []
    open_questions: list[str] = []

    @model_validator(mode="after")
    def _references_resolve(self) -> Self:
        indexes = [s.index for s in self.steps]
        if len(set(indexes)) != len(indexes):
            raise ValueError(f"step indexes must be unique, got {indexes}")

        ids = [g.id for g in self.guardrails]
        if len(set(ids)) != len(ids):
            raise ValueError(f"guardrail ids must be unique, got {ids}")

        known_ids, known_steps = set(ids), set(indexes)
        for step in self.steps:
            missing = [gid for gid in step.guardrail_ids if gid not in known_ids]
            if missing:
                raise ValueError(
                    f"step {step.index} ({step.title!r}) refers to unknown guardrails {missing}"
                )
        for guardrail in self.guardrails:
            if guardrail.step_index not in known_steps:
                raise ValueError(
                    f"guardrail {guardrail.id} ({guardrail.statement!r}) refers to unknown step {guardrail.step_index}"
                )
        return self

    @property
    def judgment_calls(self) -> list[Step]:
        return [s for s in self.steps if s.is_judgment_call]
