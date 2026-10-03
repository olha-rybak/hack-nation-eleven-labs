"""Session -> draft Work Map + ranked gaps (T-201).

The LLM only chooses: which events form a step, which transcript lines give the reason, what the
guardrails and gaps are. Everything with provenance is filled in here from the session log: quotes
are copied verbatim from transcript lines, screen moments from events. A quote can't be invented.
"""

import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel

from apprentice import prompts
from apprentice.guardrails import expr
from apprentice.llm.structured import StructuredLlm
from apprentice.workmap.draft import DraftGuardrail, DraftStep, DraftWorkMap, Gap, GapKind
from apprentice.workmap.schema import GuardrailCheck, Quote

log = logging.getLogger(__name__)

AGENT_SPEAKERS = {"agent", "apprentice", "ai", "assistant", "tutor", "interviewer"}
CUES = {"ASK_NOW"}  # control messages sent to the agent as user turns, not the expert speaking
DECISIVE = {"edit": 0, "hold": 0, "route": 0, "save": 1, "open": 2, "navigate": 3, "unknown": 4}


class LlmStep(BaseModel):
    title: str
    decision: str
    event_ids: list[str]
    reason_line_ids: list[int]
    is_judgment_call: bool


class LlmCheck(BaseModel):
    trigger_kind: Literal["edit", "save"]
    field: str
    condition: str
    severity: Literal["warn", "stop"]


class LlmGuardrail(BaseModel):
    kind: Literal["limit", "exception", "stop_and_ask", "never_do"]
    statement: str
    event_id: str
    reason_line_ids: list[int]
    check: LlmCheck | None


class LlmGap(BaseModel):
    kind: GapKind
    event_id: str | None
    question: str
    why_it_matters: str
    importance: int


class LlmDraft(BaseModel):
    title: str
    steps: list[LlmStep]
    guardrails: list[LlmGuardrail]
    gaps: list[LlmGap]


def expert_lines(transcript: list[dict]) -> list[dict]:
    """Transcript lines numbered L1.., with cue messages removed. Agent lines stay as context."""
    out = []
    for line in transcript:
        text = (line.get("text") or "").strip()
        if not text or text in CUES:
            continue
        out.append(line | {"n": len(out) + 1})
    return out


def is_agent(line: dict) -> bool:
    return str(line.get("speaker", "")).casefold() in AGENT_SPEAKERS


def render_session(events: list[dict], lines: list[dict]) -> str:
    def clock(ms: int) -> str:
        return f"{ms // 60000:02d}:{ms // 1000 % 60:02d}"

    ev = []
    for i, e in enumerate(events, 1):
        change = (
            f" · {e['field']}: {e.get('before')!r} -> {e.get('after')!r}" if e.get("field") else ""
        )
        shown = f" · visible: {e['fields']}" if e.get("fields") else ""
        ev.append(f"E{i} [{clock(e['ts_ms'])}] {e['kind']} {e['entity']}{change}{shown}")
    tr = [
        f"L{ln['n']} [{clock(ln['ts_ms'])}] {'agent' if is_agent(ln) else 'expert'}: {ln['text']}"
        for ln in lines
    ]
    return (
        "EVENTS\n" + "\n".join(ev or ["(none)"]) + "\n\nTRANSCRIPT\n" + "\n".join(tr or ["(none)"])
    )


def quote_from(line_ids: list[int], lines: list[dict]) -> Quote | None:
    """Verbatim expert words for the chosen lines; agent lines and unknown numbers are ignored."""
    by_n = {ln["n"]: ln for ln in lines}
    chosen = [by_n[i] for i in dict.fromkeys(line_ids) if i in by_n and not is_agent(by_n[i])]
    if not chosen:
        return None
    first = chosen[0]
    asked = any(is_agent(ln) for ln in lines if ln["n"] < first["n"] and ln["n"] >= first["n"] - 2)
    return Quote(
        text=" ".join(ln["text"].strip() for ln in chosen),
        speaker=str(first.get("speaker") or "expert"),
        ts_ms=int(first["ts_ms"]),
        source=first.get("source") or ("live_question" if asked else "narration"),
    )


def entity_pattern(entity: str) -> str:
    """'invoice 4471' -> a case-insensitive regex for any record of the same kind."""
    head = re.split(r"[\s#-]*\d", entity, maxsplit=1)[0].strip() or entity.strip()
    return re.escape(head) + r"[\s#-]*\d+"


def rank(gaps: list[Gap], steps: list[DraftStep]) -> list[Gap]:
    judgment = {s.index for s in steps if s.is_judgment_call}

    def key(g: Gap) -> tuple:
        return (
            -g.importance,
            g.step_index not in judgment,
            g.kind not in {"no_threshold", "unseen_branch"},
            g.step_index or 0,
        )

    ranked = sorted(gaps, key=key)
    return [g.model_copy(update={"id": f"gap-{i}"}) for i, g in enumerate(ranked, 1)]


def assemble(raw: LlmDraft, session_id: str, events: list[dict], lines: list[dict]) -> DraftWorkMap:
    by_e = {f"E{i}": e for i, e in enumerate(events, 1)}

    steps: list[DraftStep] = []
    step_of_event: dict[str, int] = {}  # E-number -> our step index
    for s in raw.steps:
        evs = [by_e[i] for i in dict.fromkeys(s.event_ids) if i in by_e]
        if not evs:
            log.warning("draft step %r has no known events; dropped", s.title)
            continue
        anchor = min(evs, key=lambda e: DECISIVE.get(e["kind"], 9))
        for i in s.event_ids:
            step_of_event.setdefault(i, len(steps) + 1)
        steps.append(
            DraftStep(
                index=len(steps) + 1,
                title=s.title,
                frame_ts=int(anchor["ts_ms"]),
                frame_ref=anchor.get("frame_ref") or "",
                decision=s.decision,
                reason=quote_from(s.reason_line_ids, lines),
                guardrail_ids=[],
                is_judgment_call=s.is_judgment_call,
                event_ids=[e.get("id") or "" for e in evs],
            )
        )
    if not steps:
        raise ValueError("no step could be tied to a screen event")
    by_index = {s.index: s for s in steps}

    gaps: list[Gap] = []

    def gap(kind: GapKind, step: int | None, q: str, why: str, imp: int, gid: str | None = None):
        gaps.append(
            Gap(
                id="",
                kind=kind,
                step_index=step,
                guardrail_id=gid,
                question=q,
                why_it_matters=why,
                importance=max(1, min(5, imp)),
            )
        )

    guardrails: list[DraftGuardrail] = []
    for g in raw.guardrails:
        step = by_index.get(step_of_event.get(g.event_id, -1))
        reason = quote_from(g.reason_line_ids, lines)
        if step is None or reason is None:
            # every guardrail needs the expert's words and a screen moment; otherwise it is a guess
            log.warning("guardrail %r has no step or no expert quote; dropped", g.statement)
            continue
        gid = f"g{len(guardrails) + 1}"
        check = None
        if g.check is not None:
            try:
                expr.parse(g.check.condition)
                entity = next(e["entity"] for e in events if e.get("id") in step.event_ids)
                check = GuardrailCheck(
                    trigger_kind=g.check.trigger_kind,
                    entity_pattern=entity_pattern(entity),
                    field=g.check.field,
                    condition=g.check.condition,
                    severity=g.check.severity,
                )
            except (expr.ConditionError, StopIteration) as e:
                log.warning(
                    "guardrail %r: unusable condition %r (%s)", g.statement, g.check.condition, e
                )
        if check is None:
            gap(
                "no_threshold",
                step.index,
                f'For "{g.statement}": what exactly is the limit or condition?',
                "The tutor can only stop a new hire on a rule it can check.",
                4,
                gid,
            )
        guardrails.append(
            DraftGuardrail(
                id=gid,
                kind=g.kind,
                statement=g.statement,
                frame_ts=step.frame_ts,
                reason=reason,
                step_index=step.index,
                check=check,
            )
        )
        step.guardrail_ids.append(gid)

    for g in raw.gaps:
        gap(
            g.kind,
            step_of_event.get(g.event_id) if g.event_id else None,
            g.question,
            g.why_it_matters,
            g.importance,
        )

    covered = {(g.kind, g.step_index) for g in gaps}
    for s in steps:
        if s.reason is None and ("no_reason", s.index) not in covered:
            gap(
                "no_reason",
                s.index,
                f"{s.decision}: why?",
                "A new hire sees what you did but not when to do it.",
                4 if s.is_judgment_call else 2,
            )
    return DraftWorkMap(
        id=f"wm-{uuid.uuid4().hex[:8]}",
        session_id=session_id,
        title=raw.title,
        created_at=datetime.now(UTC),
        steps=steps,
        guardrails=guardrails,
        gaps=rank(gaps, steps),
    )


async def build_draft(
    llm: StructuredLlm, session_id: str, events: list[dict], transcript: list[dict]
) -> DraftWorkMap:
    events = [e for e in events if e.get("id")]
    lines = expert_lines(transcript)
    raw = await llm.parse(prompts.load("workmap/draft"), render_session(events, lines), LlmDraft)
    return assemble(raw, session_id, events, lines)
