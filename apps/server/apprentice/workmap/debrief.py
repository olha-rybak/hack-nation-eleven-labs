"""Debrief (T-203): which gap to ask next, when to stop, and the Work Map it ends with.

The debrief is done when no open gap is at or above `DEBRIEF_MIN_IMPORTANCE`, or when the expert
stops it. Finishing turns the draft into a real `WorkMap`. A step or guardrail still without the
expert's words is left out of the map rather than invented; its question stays in `open_questions`.

Every session needs one guardrail question (T-108). If the live interview never asked one, guardrail
gaps go first; if the draft has none, one general guardrail question is added.
"""

from pydantic import BaseModel

from apprentice.workmap.draft import DraftWorkMap, Gap
from apprentice.workmap.schema import WorkMap

GUARDRAIL_GAP_ID = "gap-guardrail"
GUARDRAIL_QUESTION = (
    "Is there anything in this task where you would stop and check with someone before going on?"
)


class NothingExplained(ValueError):
    """No step has the expert's words yet, so there is no Work Map to make."""


class DebriefStatus(BaseModel):
    next: Gap | None  # the gap to ask now; None when the debrief is done
    queue: list[Gap]  # every gap still to ask, in asking order
    left: int  # len(queue): the "3 gaps left" counter
    done: bool
    guardrail_needed: bool  # no guardrail question asked yet, live or in the debrief


def guardrail_asked_live(pause_log: list[dict]) -> bool:
    return any((e.get("ask_now") or {}).get("guardrail") for e in pause_log)


def is_guardrail_gap(gap: Gap) -> bool:
    return gap.guardrail_id is not None or gap.kind == "no_threshold" or gap.id == GUARDRAIL_GAP_ID


def ensure_guardrail_gap(draft: DraftWorkMap, asked_live: bool) -> bool:
    """Add the general guardrail question if nothing else would cover the rule. True if added."""
    if asked_live or any(is_guardrail_gap(g) for g in draft.gaps):
        return False
    draft.gaps.insert(
        0,
        Gap(
            id=GUARDRAIL_GAP_ID,
            kind="unseen_branch",
            step_index=None,
            guardrail_id=None,
            question=GUARDRAIL_QUESTION,
            why_it_matters="A new hire needs to know where to stop, not only what to do.",
            importance=5,
        ),
    )
    return True


def status(draft: DraftWorkMap, asked_live: bool, min_importance: int) -> DebriefStatus:
    needed = not asked_live and not any(
        is_guardrail_gap(g) and g.status == "answered" for g in draft.gaps
    )
    queue = [g for g in draft.gaps if g.status == "open" and g.importance >= min_importance]
    if needed:  # stable sort: guardrail gaps first, rank order otherwise
        queue.sort(key=lambda g: not is_guardrail_gap(g))
    return DebriefStatus(
        next=queue[0] if queue else None,
        queue=queue,
        left=len(queue),
        done=not queue,
        guardrail_needed=needed,
    )


def finish(draft: DraftWorkMap) -> tuple[WorkMap, list[str]]:
    """The Work Map from what the expert explained, and the titles of what was left out."""
    steps = [s for s in draft.steps if s.reason is not None]
    if not steps:
        raise NothingExplained("no step has the expert's words yet")
    renumber = {s.index: i for i, s in enumerate(steps, 1)}
    guardrails = [g for g in draft.guardrails if g.reason is not None and g.step_index in renumber]
    kept = {g.id for g in guardrails}
    left_out = [s.title for s in draft.steps if s.index not in renumber]
    left_out += [g.statement for g in draft.guardrails if g.id not in kept]

    explained = draft.model_copy(
        update={
            "steps": [
                s.model_copy(
                    update={
                        "index": renumber[s.index],
                        "guardrail_ids": [i for i in s.guardrail_ids if i in kept],
                    }
                )
                for s in steps
            ],
            "guardrails": [
                g.model_copy(update={"step_index": renumber[g.step_index]}) for g in guardrails
            ],
        }
    )
    return explained.to_workmap(), left_out
