import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.guardrails.engine import GuardrailEngine
from apprentice.session.store import SessionStore
from apprentice.teach.report import build_report
from apprentice.teach.routes import router
from apprentice.workmap.schema import WorkMap

FIXTURE = Path(__file__).parent / "fixtures" / "workmap_returns.json"


@pytest.fixture
def wm():
    return WorkMap.model_validate_json(FIXTURE.read_text(encoding="utf-8"))


def opened(entity, ts, **fields):
    return {"id": f"open-{entity}", "ts_ms": ts, "kind": "open", "entity": entity, "fields": fields}


def pick(entity, ts, before, after):
    return {"id": f"pick-{ts}", "ts_ms": ts, "kind": "edit", "entity": entity,
            "field": "Resolution", "before": before, "after": after}  # fmt: skip


def end(entity, ts, kind):
    return {"id": f"{kind}-{entity}", "ts_ms": ts, "kind": kind, "entity": entity}


SOUNDBAR = {
    "Price paid": "279.00 EUR",
    "Reason": "Arrived damaged",
    "Packaging": "Box badly dented on two sides, something rattles inside",
    "Orders (12 months)": "5",
    "Returns (12 months)": "0",
    "Resolution": "Select...",
}


def test_fixture_loads_and_every_check_compiles(wm):
    assert wm.confirmed_at is not None and wm.session_id == "sess-brandt-001"
    engine = GuardrailEngine(wm)
    assert engine.invalid == {}
    assert len(engine.checks) == 3


def test_acceptance_run_refund_then_complete_misses_both_rules(wm):
    events = [
        opened("Return RMA-2051", 1000, **SOUNDBAR),
        pick("Return RMA-2051", 2000, "Select...", "Refund"),
        end("Return RMA-2051", 3000, "save"),
    ]
    report = build_report(wm, events)
    assert {g.guardrail_id for g in report.guardrails} == {"g-carrier-claim", "g-supervisor-limit"}
    assert not any(g.resolved for g in report.guardrails)
    assert len(report.missed) == 2
    assert all(m.startswith("Return RMA-2051: ") for m in report.missed)
    assert report.mastered == []
    assert len(report.practice_next) == 2
    assert all('As M. Brandt put it: "' in line for line in report.practice_next)
    by_id = {g.guardrail_id: g for g in report.guardrails}
    assert by_id["g-carrier-claim"].resolution == "Completed with Resolution = Refund anyway."
    assert by_id["g-supervisor-limit"].resolution.startswith("Completed although: Any return")
    assert by_id["g-carrier-claim"].quote.speaker == "M. Brandt"


def test_intervened_changed_to_carrier_claim_and_escalated(wm):
    events = [
        opened("Return RMA-2051", 1000, **SOUNDBAR),
        pick("Return RMA-2051", 2000, "Select...", "Refund"),
        pick("Return RMA-2051", 3000, "Refund", "Carrier claim"),
        end("Return RMA-2051", 4000, "route"),
    ]
    report = build_report(wm, events)
    [g] = report.guardrails
    assert g.guardrail_id == "g-carrier-claim" and g.resolved
    assert "changed Resolution to Carrier claim" in g.resolution
    assert report.missed == []
    assert report.mastered == [
        "Return RMA-2051: handled correctly (escalated to a supervisor)",
        f"Return RMA-2051: {wm.guardrails[1].statement}",
    ]
    assert len(report.practice_next) == 1


def test_escalating_without_fixing_the_resolution_still_resolves_the_edit_hit(wm):
    events = [
        opened("Return RMA-2051", 1000, **SOUNDBAR),
        pick("Return RMA-2051", 2000, "Select...", "Refund"),
        end("Return RMA-2051", 3000, "route"),
    ]
    [g] = build_report(wm, events).guardrails
    assert g.resolved and g.resolution == "Escalated instead of completing."


def test_clean_warm_up(wm):
    events = [
        opened("Return RMA-2052", 1000, **{
            "Price paid": "19.00 EUR", "Reason": "Wrong item", "Returns (12 months)": "0",
            "Resolution": "Select...",
        }),
        pick("Return RMA-2052", 2000, "Select...", "Replacement"),
        end("Return RMA-2052", 3000, "save"),
    ]  # fmt: skip
    report = build_report(wm, events)
    assert report.guardrails == [] and report.missed == [] and report.practice_next == []
    assert report.mastered == ["Return RMA-2052: handled correctly (completed as Replacement)"]


def test_abuse_refund_is_missed(wm):
    events = [
        opened("Return RMA-1099", 1000, **{
            "Price paid": "120.00 EUR", "Reason": "Does not fit", "Orders (12 months)": "10",
            "Returns (12 months)": "9", "Resolution": "Select...",
        }),
        pick("Return RMA-1099", 2000, "Select...", "Refund"),
        end("Return RMA-1099", 3000, "save"),
    ]  # fmt: skip
    report = build_report(wm, events)
    [g] = report.guardrails
    assert g.guardrail_id == "g-abuse" and not g.resolved
    assert report.missed == [f"Return RMA-1099: {wm.guardrails[2].statement}"]
    assert report.mastered == []


@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.state.store = SessionStore(tmp_path)
    return TestClient(app)


def _expert_session(client, confirmed=True):
    store = client.app.state.store
    store.create("expert")
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if not confirmed:
        raw["confirmed_at"] = None
    (store.session_dir("expert") / "workmap.json").write_text(json.dumps(raw), encoding="utf-8")


def test_route_missing_session_or_map_is_404(client):
    store = client.app.state.store
    store.create("hire")
    r = client.get("/sessions/hire/report", params={"workmap_session": "nope"})
    assert r.status_code == 404
    store.create("expert")
    r = client.get("/sessions/hire/report", params={"workmap_session": "expert"})
    assert r.status_code == 404
    r = client.get("/sessions/ghost/report", params={"workmap_session": "expert"})
    assert r.status_code == 404


def test_route_unconfirmed_map_is_409(client):
    _expert_session(client, confirmed=False)
    client.app.state.store.create("hire")
    r = client.get("/sessions/hire/report", params={"workmap_session": "expert"})
    assert r.status_code == 409


def test_route_returns_the_report_shape(client):
    _expert_session(client)
    store = client.app.state.store
    store.create("hire")
    for ev in (
        opened("Return RMA-2051", 1000, **SOUNDBAR),
        pick("Return RMA-2051", 2000, "Select...", "Refund"),
        end("Return RMA-2051", 3000, "save"),
    ):
        store.append_event("hire", ev)
    r = client.get("/sessions/hire/report", params={"workmap_session": "expert"})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"mastered", "missed", "guardrails", "practice_next"}
    assert set(body["guardrails"][0]) == {
        "guardrail_id", "statement", "resolution", "resolved", "entity", "quote",
    }  # fmt: skip
    assert set(body["guardrails"][0]["quote"]) == {"text", "speaker"}
    assert len(body["missed"]) == 2
