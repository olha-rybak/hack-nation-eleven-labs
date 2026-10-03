"""Draft Work Map (T-201): what the builder produces before the debrief closes the gaps.

Same shape as the Work Map, except a reason may still be missing. Each missing piece is a ranked
`Gap` the debrief (T-203) asks about. `to_workmap()` succeeds only once every step and guardrail has
the expert's words, because the schema in `schema.py` enforces provenance.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from apprentice.workmap.schema import GuardrailCheck, Quote, WorkMap

GapKind = Literal["no_reason", "no_threshold", "unseen_branch", "inconsistency"]


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


class DraftWorkMap(BaseModel):
    id: str
    session_id: str
    title: str
    created_at: datetime
    steps: list[DraftStep]
    guardrails: list[DraftGuardrail]
    gaps: list[Gap]  # ranked, most important first

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
                "open_questions": [g.question for g in self.gaps],
            }
        )
