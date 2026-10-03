"""Evaluate live events against a confirmed Work Map's guardrails (T-300).

Timing is the whole point:
- `edit`-triggered checks fire on the edit event itself, before any save exists.
- `save`-triggered checks ("no asset number, no capex") can't wait for the save either, so they are
  evaluated after every event on the entity and exposed as `pending()`. The tutor intervenes on a
  pending `stop` as soon as the new hire pauses on that record (pause detector), and `on_event`
  still reports it on the save itself as a last resort.
"""

import ast
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from apprentice.guardrails import expr
from apprentice.workmap.schema import Guardrail, Quote, WorkMap

log = logging.getLogger(__name__)

# Screen label (casefolded) -> condition variable. Extend as the fake ERP's labels settle (T-100).
FIELD_VARS = {
    "amount": "amount", "gross amount": "amount", "total": "amount", "net amount": "amount",
    "supplier": "supplier", "vendor": "supplier",
    "cost center": "cost_center", "cost centre": "cost_center", "cost center code": "cost_center",
    "asset number": "asset_number", "asset no": "asset_number", "asset no.": "asset_number",
    "date": "date", "invoice date": "date",
    "country": "country", "supplier country": "country",
    "second approval": "second_approval", "second approver": "second_approval",
    "approver 2": "second_approval",
    "new supplier": "is_new_supplier", "new vendor": "is_new_supplier",
}  # fmt: skip

MONTHS = {
    m: i for i, m in enumerate(("jan feb mar apr may jun jul aug sep oct nov dec").split(), 1)
}


class NotConfirmed(Exception):
    """Only a confirmed Work Map may teach (T-204)."""


@dataclass(frozen=True)
class Hit:
    guardrail_id: str
    severity: str  # "warn" | "stop"
    statement: str
    reason: Quote  # the expert's own words — the tutor ends every intervention with this
    entity: str
    event_id: str | None
    frame_refs: list[str]  # the expert's screen moments for this guardrail, for the replay
    timing: str  # "on_edit" | "pre_save" | "on_save"


@dataclass
class _Compiled:
    guardrail: Guardrail
    tree: ast.Expression
    entity_re: re.Pattern


@dataclass
class _EntityState:
    facts: dict[str, Any] = field(default_factory=dict)
    fired: set[str] = field(default_factory=set)  # guardrail ids currently firing on this entity


def parse_amount(v: str) -> float | None:
    s = re.sub(r"[^\d,.\-]", "", v)
    if not s:
        return None
    if "," in s and "." in s:  # the last separator is the decimal one: 7,200.00 / 7.200,00
        dec = "." if s.rfind(".") > s.rfind(",") else ","
        s = s.replace("," if dec == "." else ".", "").replace(dec, ".")
    elif "," in s:
        head, _, tail = s.rpartition(",")
        s = f"{head.replace(',', '')}.{tail}" if len(tail) != 3 else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_month(v: str) -> int | None:
    if m := re.search(r"\b\d{4}-(\d{1,2})-\d{1,2}\b", v):  # 2026-12-03
        return int(m.group(1))
    if m := re.search(r"\b\d{1,2}[./](\d{1,2})[./]\d{2,4}\b", v):  # 03.12.2026
        return int(m.group(1))
    for name, i in MONTHS.items():
        if re.search(rf"\b{name}", v, re.IGNORECASE):
            return i
    return None


def _flag(v: str) -> bool | None:
    s = v.strip().casefold()
    if s in {"", "-", "n/a"}:
        return None
    return s not in {"no", "false", "0", "none", "pending", "missing"}


def to_var(label: str, value: str | None) -> tuple[str, Any] | None:
    var = FIELD_VARS.get(" ".join(label.split()).casefold().rstrip(":"))
    if var is None:
        return None
    value = (value or "").strip()
    match var:
        case "amount":
            return var, parse_amount(value)
        case "date":
            return "month", parse_month(value)
        case "is_new_supplier" | "second_approval":
            return var, _flag(value)
        case _:
            return var, value or None


class GuardrailEngine:
    def __init__(self, workmap: WorkMap):
        if workmap.confirmed_at is None:
            raise NotConfirmed(f"work map {workmap.id} is not confirmed")
        self.workmap = workmap
        self.checks: list[_Compiled] = []
        self.invalid: dict[str, str] = {}  # guardrail id -> why its condition was rejected
        for g in workmap.guardrails:
            if g.check is None:
                continue
            try:
                tree = expr.parse(g.check.condition)
            except expr.ConditionError as e:
                self.invalid[g.id] = str(e)
                log.warning("guardrail %s: unusable condition %r: %s", g.id, g.check.condition, e)
                continue
            self.checks.append(_Compiled(g, tree, re.compile(g.check.entity_pattern, re.I)))
        self._entities: dict[str, _EntityState] = {}

    def facts(self, entity: str) -> dict[str, Any]:
        return dict(self._state(entity).facts)

    def on_event(self, event: dict) -> list[Hit]:
        """Feed every accepted event; returns guardrails to act on now."""
        entity, kind = event["entity"], event["kind"]
        st = self._state(entity)
        self._observe(st, event)
        hits = []
        for c in self._matching(entity):
            chk = c.guardrail.check
            if chk.trigger_kind == "edit" and kind == "edit" and _field_ok(chk.field, event):
                env = st.facts | {
                    "after": event.get("after"),
                    "before": event.get("before"),
                    "field": event.get("field"),
                }
                if self._fires(st, c, env):
                    hits.append(self._hit(c, entity, event.get("id"), "on_edit"))
            elif chk.trigger_kind == "save" and kind == "save":
                if expr.evaluate(c.tree, st.facts):
                    hits.append(self._hit(c, entity, event.get("id"), "on_save"))
            elif chk.trigger_kind == kind and chk.trigger_kind not in {"edit", "save"}:
                if self._fires(st, c, st.facts):
                    hits.append(self._hit(c, entity, event.get("id"), f"on_{kind}"))
        return hits

    def pending(self, entity: str) -> list[Hit]:
        """Save-triggered guardrails that would be broken if this entity were saved right now."""
        st = self._state(entity)
        return [
            self._hit(c, entity, None, "pre_save")
            for c in self._matching(entity)
            if c.guardrail.check.trigger_kind == "save" and expr.evaluate(c.tree, st.facts)
        ]

    def _state(self, entity: str) -> _EntityState:
        return self._entities.setdefault(" ".join(entity.split()).casefold(), _EntityState())

    def _observe(self, st: _EntityState, event: dict) -> None:
        for label, value in (event.get("fields") or {}).items():
            if kv := to_var(label, value):
                st.facts[kv[0]] = kv[1]
        if event["kind"] == "edit" and event.get("field"):
            if kv := to_var(event["field"], event.get("after")):
                st.facts[kv[0]] = kv[1]

    def _matching(self, entity: str) -> list[_Compiled]:
        return [c for c in self.checks if c.entity_re.search(entity)]

    def _fires(self, st: _EntityState, c: _Compiled, env: dict) -> bool:
        """Edge-triggered: fire when a guardrail becomes violated, not on every later event."""
        gid = c.guardrail.id
        if expr.evaluate(c.tree, env):
            if gid in st.fired:
                return False
            st.fired.add(gid)
            return True
        st.fired.discard(gid)
        return False

    def _hit(self, c: _Compiled, entity: str, event_id: str | None, timing: str) -> Hit:
        g = c.guardrail
        frames = [g.frame_ref] + [s.frame_ref for s in self.workmap.steps_for(g.id)]
        return Hit(
            guardrail_id=g.id,
            severity=g.check.severity,
            statement=g.statement,
            reason=g.reason,
            entity=entity,
            event_id=event_id,
            frame_refs=list(dict.fromkeys(frames)),
            timing=timing,
        )


def _field_ok(check_field: str | None, event: dict) -> bool:
    if check_field is None:
        return True
    norm = lambda s: " ".join((s or "").split()).casefold()  # noqa: E731
    return norm(check_field) == norm(event.get("field"))
