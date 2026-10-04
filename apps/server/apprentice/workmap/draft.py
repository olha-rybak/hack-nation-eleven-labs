"""Draft Work Map (T-201): what the builder produces before the debrief closes the gaps.

Same shape as the Work Map, except a reason may still be missing. Each missing piece is a ranked
`Gap` the debrief (T-203) asks about. `to_workmap()` succeeds only once every step and guardrail has
the expert's words, because the schema in `schema.py` enforces provenance.

A debrief answer is a `Quote(source="debrief")`. It fills the reason of the gap's guardrail, or else
its step, if that reason is still missing; the gap keeps the answer either way.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from apprentice.workmap.schema import GuardrailCheck, Quote, WorkMap

GapKind = Literal["no_reason", "no_threshold", "unseen_branch", "inconsistency"]
GapStatus = Literal["open", "answered", "declined"]


class GapClosed(ValueError):
    """The gap was already answered or declined."""


class DraftStep(BaseModel):
    index: int
    title: str
    frame_ts: int
    frame_ref: str
    decision: str
    reason: Quote | None
    guardrail_ids: list[str]
    is_judgment_call: bool
    event_ids: list[str]


class DraftGuardrail(BaseModel):
    id: str
    kind: Literal["limit", "exception", "stop_and_ask", "never_do"]
    statement: str
    frame_ts: int
    reason: Quote | None
    step_index: int
    check: GuardrailCheck | None


class Gap(BaseModel):
    id: str
    kind: GapKind
    step_index: int | None
    guardrail_id: str | None
    question: str  # one spoken sentence the debrief can ask as is
    why_it_matters: str
    importance: int  # 1-5: how much the answer changes what a new hire could do
    status: GapStatus = "open"
    answer: Quote | None = None


class DraftWorkMap(BaseModel):
    id: str
    session_id: str
    title: str
    created_at: datetime
    steps: list[DraftStep]
    guardrails: list[DraftGuardrail]
    gaps: list[Gap]  # ranked, most important first

    def gap(self, gap_id: str) -> Gap:
        """Raises KeyError for an unknown id, GapClosed if it is no longer open."""
        gap = next((g for g in self.gaps if g.id == gap_id), None)
        if gap is None:
            raise KeyError(gap_id)
        if gap.status != "open":
            raise GapClosed(f"{gap_id} is already {gap.status}")
        return gap

    def step_for(self, gap: Gap) -> DraftStep | None:
        """The step a gap is about, directly or through its guardrail."""
        index = gap.step_index
        if gap.guardrail_id:
            index = next((g.step_index for g in self.guardrails if g.id == gap.guardrail_id), index)
        return next((s for s in self.steps if s.index == index), None)

    def answer(self, gap_id: str, quote: Quote) -> Gap:
        gap = self.gap(gap_id)
        gap.status, gap.answer = "answered", quote
        guardrail = next((g for g in self.guardrails if g.id == gap.guardrail_id), None)
        target = guardrail or self.step_for(gap)
        if target is not None and target.reason is None:
            target.reason = quote
        return gap

    def decline(self, gap_id: str) -> Gap:
        gap = self.gap(gap_id)
        gap.status = "declined"
        return gap

    def to_workmap(self) -> WorkMap:
        """Raises pydantic.ValidationError while any step or guardrail still lacks a quote."""
        return WorkMap.model_validate(
            {
                "id": self.id,
                "session_id": self.session_id,
                "title": self.title,
                "created_at": self.created_at,
                "steps": [s.model_dump(exclude={"event_ids"}) for s in self.steps],
                "guardrails": [g.model_dump() for g in self.guardrails],
                "open_questions": [g.question for g in self.gaps if g.status != "answered"],
            }
        )
