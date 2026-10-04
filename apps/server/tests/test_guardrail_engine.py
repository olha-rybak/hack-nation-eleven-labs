from pathlib import Path

import pytest

from apprentice.guardrails.engine import (
    GuardrailEngine,
    NotConfirmed,
    parse_amount,
    parse_month,
    to_var,
)
from apprentice.workmap.schema import WorkMap

FIXTURE = Path(__file__).parent / "fixtures" / "workmap_guardrails.json"


@pytest.fixture
def wm():
    return WorkMap.model_validate_json(FIXTURE.read_text(encoding="utf-8"))


def opened(entity, **fields):
    return {"id": f"open-{entity}", "kind": "open", "entity": entity, "fields": fields}


def edit(entity, field, before, after, id="e"):
    return {"id": id, "kind": "edit", "entity": entity, "field": field,
            "before": before, "after": after}  # fmt: skip


def test_acceptance_capex_stop_fires_on_edit_before_any_save(wm):
    """T-300 acceptance: coding a EUR 7,200 equipment invoice to 4711 stops on the edit event."""
    eng = GuardrailEngine(wm)
    stream = [
        opened("invoice 4471", Supplier="Weber Maschinenbau", Amount="EUR 7,200.00",
               **{"Cost center": "", "Asset number": ""}),
        edit("invoice 4471", "Cost center", "", "4711 - Opex general", id="e1"),
    ]  # fmt: skip
    hits = [h for ev in stream for h in eng.on_event(ev)]
    [hit] = hits
    assert hit.guardrail_id == "g-capex-limit" and hit.severity == "stop"
    assert hit.timing == "on_edit" and hit.event_id == "e1"
    assert hit.reason.text and hit.reason.speaker == "Sabine"  # the expert's words attached
    assert hit.frame_refs  # the expert's screen moment, for the side-by-side replay
    assert not any(ev["kind"] == "save" for ev in stream)


def test_under_the_line_does_not_fire(wm):
    eng = GuardrailEngine(wm)
    eng.on_event(opened("invoice 5001", Amount="4.200,00 EUR"))
    assert eng.on_event(edit("invoice 5001", "Cost center", "", "4711")) == []


def test_unknown_amount_never_fires(wm):
    eng = GuardrailEngine(wm)
    assert eng.on_event(edit("invoice 9", "Cost center", "", "4711")) == []


def test_fires_once_per_violation_then_rearms(wm):
    eng = GuardrailEngine(wm)
    eng.on_event(opened("INV-4471", Amount="7200"))
    assert len(eng.on_event(edit("INV-4471", "Cost center", "", "4711"))) == 1
    assert eng.on_event(edit("INV-4471", "Cost center", "4711", "4711 ")) == []  # still violated
    assert eng.on_event(edit("INV-4471", "Cost center", "4711", "0400")) == []  # fixed
    assert len(eng.on_event(edit("INV-4471", "Cost center", "0400", "4711"))) == 1  # broken again


def test_asset_number_is_pending_before_save_and_cleared_by_entering_it(wm):
    eng = GuardrailEngine(wm)
    eng.on_event(opened("invoice 4471", Amount="7200", **{"Asset number": ""}))
    eng.on_event(edit("invoice 4471", "Cost center", "4711", "0400 - Capex equipment"))
    [p] = eng.pending("invoice 4471")
    assert p.guardrail_id == "g-asset-number" and p.timing == "pre_save"
    eng.on_event(edit("invoice 4471", "Asset number", "", "AS-20931"))
    assert eng.pending("invoice 4471") == []


def test_save_triggered_reported_on_save_as_last_resort(wm):
    eng = GuardrailEngine(wm)
    eng.on_event(opened("invoice 4472", Supplier="Nordtec GmbH", Date="2026-12-03"))
    [hit] = eng.on_event({"id": "s", "kind": "save", "entity": "invoice 4472"})
    assert hit.guardrail_id == "g-nordtec-duplicate" and hit.timing == "on_save"


def test_unseen_case_inv4474(wm):
    """T-303 shape: EUR 9,400 from a supplier the expert never processed still hits capex."""
    eng = GuardrailEngine(wm)
    eng.on_event(opened("invoice 4474", Supplier="Brandt Fertigungstechnik", Gross="EUR 9,400.00",
                        **{"Vendor no.": ""}))  # fmt: skip
    [hit] = eng.on_event(edit("invoice 4474", "Cost center", "", "4711"))
    assert hit.guardrail_id == "g-capex-limit"
    assert eng.facts("invoice 4474")["is_new_supplier"] is True


def test_unconfirmed_map_refused(wm):
    with pytest.raises(NotConfirmed):
        GuardrailEngine(wm.model_copy(update={"confirmed_at": None}))


def test_bad_llm_condition_is_quarantined_not_fatal(wm):
    g = wm.guardrails[0]
    bad = g.model_copy(
        update={"check": g.check.model_copy(update={"condition": "__import__('os')"})}
    )
    eng = GuardrailEngine(wm.model_copy(update={"guardrails": [bad, *wm.guardrails[1:]]}))
    assert g.id in eng.invalid and len(eng.checks) == len(wm.guardrails) - 1


@pytest.mark.parametrize(
    "raw, expected",
    [("EUR 7,200.00", 7200.0), ("7.200,00 €", 7200.0), ("9400", 9400.0), ("1,5", 1.5),
     ("12,000", 12000.0), ("", None)],
)  # fmt: skip
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == expected


@pytest.mark.parametrize(
    "raw, expected", [("2026-12-03", 12), ("03.12.2026", 12), ("3 December 2026", 12), ("x", None)]
)
def test_parse_month(raw, expected):
    assert parse_month(raw) == expected


def test_returns_desk_labels_map_to_condition_variables():
    assert to_var("Price paid", "279.00 EUR") == ("amount", 279.0)
    assert to_var("Price", "19,00 EUR") == ("amount", 19.0)
    assert to_var("Reason", "Arrived damaged") == ("reason", "Arrived damaged")
    assert to_var("Packaging", "Box dented") == ("packaging", "Box dented")
    assert to_var("Resolution", "Carrier claim") == ("resolution", "Carrier claim")
    assert to_var("Orders (12 months)", "10") == ("orders_12m", 10.0)
    assert to_var("Returns (12 months)", "9") == ("returns_12m", 9.0)
    assert to_var("Returns (12 months)", "") == ("returns_12m", None)
