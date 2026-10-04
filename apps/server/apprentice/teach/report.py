"""Progress report for a tutored session (T-303): replay the new hire's events against the
confirmed Work Map's guardrails and say what they handled, what they missed and what to practice.

Deterministic, no LLM. A case ends at its first `save` (completed) or `route` (escalated).
"""

from dataclasses import dataclass, field

from pydantic import BaseModel

from apprentice.guardrails import expr
from apprentice.guardrails.engine import GuardrailEngine, Hit
from apprentice.workmap.schema import WorkMap


class ReportQuote(BaseModel):
    text: str
    speaker: str


class GuardrailOutcome(BaseModel):
    guardrail_id: str
    statement: str
    resolution: str
    resolved: bool
    entity: str
    quote: ReportQuote


class ProgressReport(BaseModel):
    mastered: list[str]
    missed: list[str]
    guardrails: list[GuardrailOutcome]
    practice_next: list[str]


def _norm(s: str | None) -> str:
    return " ".join((s or "").split()).casefold()


@dataclass
class _Record:
    hit: Hit
    resolved: bool = False
    resolution: str = ""
    field: str = ""
    value: str = ""


@dataclass
class _Case:
    entity: str
    records: dict[str, _Record] = field(default_factory=dict)
    followed: list[str] = field(default_factory=list)  # statements of save guardrails obeyed
    outcome: str | None = None


def _violated(engine: GuardrailEngine, record: _Record, event: dict) -> bool:
    check = next(c for c in engine.checks if c.guardrail.id == record.hit.guardrail_id)
    env = engine.facts(record.hit.entity) | {
        "after": event.get("after"),
        "before": event.get("before"),
        "field": event.get("field"),
    }
    return expr.evaluate(check.tree, env)


def _unresolved_text(record: _Record, ended: bool) -> str:
    if record.hit.timing == "on_save":
        return f"Completed although: {record.hit.statement}"
    if ended:
        return f"Completed with {record.field} = {record.value} anyway."
    return f"Still {record.field} = {record.value} when the session ended."


def build_report(workmap: WorkMap, events: list[dict]) -> ProgressReport:
    engine = GuardrailEngine(workmap)
    cases: dict[str, _Case] = {}
    for ev in sorted(events, key=lambda e: e.get("ts_ms", 0)):
        key = _norm(ev["entity"])
        case = cases.setdefault(key, _Case(ev["entity"]))
        if case.outcome is not None:
            continue
        hits = engine.on_event(ev)
        if ev["kind"] == "edit":
            for record in case.records.values():
                if (
                    not record.resolved
                    and record.hit.timing == "on_edit"
                    and _norm(record.field) == _norm(ev.get("field"))
                ):
                    record.value = ev.get("after") or ""
                    if not _violated(engine, record, ev):
                        record.resolved = True
                        record.resolution = (
                            f"Stopped before completing and changed {record.field} "
                            f"to {record.value}."
                        )
        for hit in hits:
            case.records[hit.guardrail_id] = _Record(
                hit, field=ev.get("field") or "", value=ev.get("after") or ""
            )
        if ev["kind"] == "route":
            case.outcome = "escalated to a supervisor"
            for record in case.records.values():
                if not record.resolved and record.hit.timing == "on_edit":
                    record.resolved = True
                    record.resolution = "Escalated instead of completing."
            case.followed = [p.statement for p in engine.pending(ev["entity"])]
        elif ev["kind"] == "save":
            resolution = engine.facts(ev["entity"]).get("resolution")
            case.outcome = f"completed as {resolution}" if resolution else "completed"

    mastered, missed, outcomes, practice = [], [], [], []
    practiced: set[str] = set()
    for case in cases.values():
        unresolved = False
        for record in case.records.values():
            if not record.resolved:
                unresolved = True
                record.resolution = _unresolved_text(record, case.outcome is not None)
                missed.append(f"{case.entity}: {record.hit.statement}")
            outcomes.append(
                GuardrailOutcome(
                    guardrail_id=record.hit.guardrail_id,
                    statement=record.hit.statement,
                    resolution=record.resolution,
                    resolved=record.resolved,
                    entity=case.entity,
                    quote=ReportQuote(
                        text=record.hit.reason.text, speaker=record.hit.reason.speaker
                    ),
                )
            )
            if record.hit.guardrail_id not in practiced:
                practiced.add(record.hit.guardrail_id)
                practice.append(
                    f"{record.hit.statement} As {record.hit.reason.speaker} put it: "
                    f'"{record.hit.reason.text}"'
                )
        if case.outcome is not None and not unresolved:
            mastered.append(f"{case.entity}: handled correctly ({case.outcome})")
            mastered.extend(f"{case.entity}: {s}" for s in case.followed)
    return ProgressReport(
        mastered=mastered, missed=missed, guardrails=outcomes, practice_next=practice
    )
