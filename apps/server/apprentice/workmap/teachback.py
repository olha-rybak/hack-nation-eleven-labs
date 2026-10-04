"""Teach-back (T-204): the apprentice explains the whole process back in under a minute, and the
expert's corrections land as edits to the Work Map, not as extra transcript.

Both go through the map LLM. If it fails, the teach-back falls back to a summary built from the map
itself, and a correction answers with an error the page can show; nothing is guessed.
"""

from typing import Literal

from pydantic import BaseModel

from apprentice import prompts
from apprentice.guardrails import expr
from apprentice.llm.structured import StructuredLlm
from apprentice.workmap.schema import WorkMap

MAX_WORDS = 140  # about a minute of speech


class TeachBack(BaseModel):
    text: str


class Edit(BaseModel):
    target: Literal["step", "guardrail"]
    ref: str  # the step's index or the guardrail's id
    field: Literal["title", "decision", "statement", "condition"]
    value: str


class Correction(BaseModel):
    edits: list[Edit]


class Change(BaseModel):
    target: Literal["step", "guardrail"]
    ref: str
    label: str  # the step title or guardrail statement it belongs to, as it was
    field: str
    before: str
    after: str


def render(wm: WorkMap) -> str:
    """The map as the LLM reads it: steps in order, then guardrails with their checks."""
    lines = [f"Work Map: {wm.title}", "Steps:"]
    for s in sorted(wm.steps, key=lambda s: s.index):
        judgment = " (judgment call)" if s.is_judgment_call else ""
        lines.append(f"{s.index}. {s.title}{judgment}. Decision: {s.decision}")
    lines.append("Guardrails:")
    for g in wm.guardrails:
        check = f" Check: {g.check.condition}" if g.check else ""
        lines.append(f"{g.id} (step {g.step_index}, {g.kind}): {g.statement}{check}")
    return "\n".join(lines)


def _trim(text: str) -> str:
    words = text.split()
    return (
        text.strip() if len(words) <= MAX_WORDS else " ".join(words[:MAX_WORDS]).rstrip(",;") + "."
    )


def fallback_text(wm: WorkMap) -> str:
    """The rules always fit; steps fill what is left of the minute, judgment calls first."""
    rules = [f"{g.statement.rstrip('.')}." for g in wm.guardrails]
    head = "Here is how I understand it."
    budget = MAX_WORDS - len(head.split()) - sum(len(r.split()) for r in rules) - 2
    steps = sorted(wm.steps, key=lambda s: (not s.is_judgment_call, s.index))
    said: list[tuple[int, str]] = []
    for s in steps:
        line = f"{s.decision.rstrip('.')}."
        if len(line.split()) <= budget:
            said.append((s.index, line))
            budget -= len(line.split())
    body = " ".join(line for _, line in sorted(said))
    tail = f" The rules: {' '.join(rules)}" if rules else ""
    return f"{head} {body}{tail}".strip()


async def compose(llm: StructuredLlm, wm: WorkMap) -> str:
    try:
        out = await llm.parse(prompts.load("workmap/teachback"), render(wm), TeachBack)
        return _trim(out.text) if out.text.strip() else fallback_text(wm)
    except Exception:  # noqa: BLE001 - a teach-back must always be ready to read
        return fallback_text(wm)


def apply(wm: WorkMap, edits: list[Edit]) -> tuple[WorkMap, list[Change]]:
    """Apply the edits that point at something real; return the new map and what changed."""
    steps = {str(s.index): s for s in wm.steps}
    guardrails = {g.id: g for g in wm.guardrails}
    new = wm.model_copy(deep=True)
    new_steps = {str(s.index): s for s in new.steps}
    new_guardrails = {g.id: g for g in new.guardrails}
    changes: list[Change] = []

    def changed(target, ref: str, label: str, field: str, before: str, after: str) -> None:
        changes.append(
            Change(target=target, ref=ref, label=label, field=field, before=before, after=after)
        )

    for e in edits:
        value = e.value.strip()
        if not value:
            continue
        if e.target == "step" and e.ref in steps and e.field in ("title", "decision"):
            before = getattr(steps[e.ref], e.field)
            if before != value:
                setattr(new_steps[e.ref], e.field, value)
                changed("step", e.ref, steps[e.ref].title, e.field, before, value)
        elif e.target == "guardrail" and e.ref in guardrails:
            g, ng = guardrails[e.ref], new_guardrails[e.ref]
            if e.field == "statement" and g.statement != value:
                ng.statement = value
                changed("guardrail", e.ref, g.statement, "statement", g.statement, value)
            elif e.field == "condition" and g.check and g.check.condition != value:
                try:
                    expr.parse(value)  # the tutor must still be able to evaluate it
                except expr.ConditionError:
                    continue
                ng.check.condition = value
                changed("guardrail", e.ref, g.statement, "condition", g.check.condition, value)
    return WorkMap.model_validate(new.model_dump()), changes


async def correct(llm: StructuredLlm, wm: WorkMap, said: str) -> tuple[WorkMap, list[Change]]:
    user = f"{render(wm)}\n\nThe expert said:\n{said.strip()}"
    out = await llm.parse(prompts.load("workmap/correct"), user, Correction)
    return apply(wm, out.edits)
