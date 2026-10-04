import asyncio
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.guardrails.live import WORKMAP_FILE, LiveGuardrails
from apprentice.interviewer import router as interviewer_router
from apprentice.knowledge.graph import KnowledgeGraph
from apprentice.privacy.redactor import Redactor
from apprentice.session.hub import Hub
from apprentice.session.routes import router as session_router
from apprentice.session.store import SessionStore
from apprentice.settings import Settings
from apprentice.workmap.routes import router as workmap_router

FIXTURE = Path(__file__).parent / "fixtures" / "workmap_guardrails.json"
FRAME = "frames/0000001000.jpg"


class RecordingHub(Hub):
    def __init__(self) -> None:
        super().__init__()
        self.sent: list[tuple[str, str, dict]] = []

    async def publish(self, session_id, type, data) -> None:
        self.sent.append((session_id, type, data))
        await super().publish(session_id, type, data)


def expert_session(store: SessionStore, confirmed: bool = True) -> str:
    sid = store.create("expert1", "interviewer")
    wm = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if not confirmed:
        wm["confirmed_at"] = None
    (store.session_dir(sid) / WORKMAP_FILE).write_text(json.dumps(wm), encoding="utf-8")
    return sid


def opened(entity, ts=1000, **fields):
    return {"id": "open-1", "ts_ms": ts, "kind": "open", "entity": entity, "fields": fields,
            "confidence": 0.9, "frame_ref": FRAME}  # fmt: skip


def edit(entity, field, before, after, id, ts):
    return {"id": id, "ts_ms": ts, "kind": "edit", "entity": entity, "field": field,
            "before": before, "after": after, "confidence": 0.9, "frame_ref": FRAME}  # fmt: skip


@pytest.fixture
def live(tmp_path):
    store = SessionStore(tmp_path)
    expert = expert_session(store)
    store.create("tutor1", "tutor", {"work_map_id": expert})
    return LiveGuardrails(store, RecordingHub())


def run(live, *events):
    asyncio.run(live.on_events("tutor1", list(events)))
    return [(t, d) for _, t, d in live.hub.sent]


def test_stop_is_pushed_on_the_edit_with_the_experts_quote_and_frame(live):
    sent = run(
        live,
        opened("invoice 4471", Amount="EUR 7,200.00", **{"Cost center": ""}),
        edit("invoice 4471", "Cost center", "", "4711 - Opex general", "e1", 2000),
    )
    [(type, hit)] = [s for s in sent if s[1]["guardrail_id"] == "g-capex-limit"]
    assert type == "guardrail_hit" and hit["severity"] == "stop" and hit["timing"] == "on_edit"
    assert hit["event_id"] == "e1" and hit["ts_ms"] == 2000
    assert hit["reason"]["text"] and hit["reason"]["speaker"] == "Sabine"
    assert hit["source_session_id"] and hit["frame_refs"]
    assert live.store.guardrails("tutor1")[-1]["type"] in {"guardrail_hit", "guardrail_resolved"}


def test_fixing_the_edit_resolves_it(live):
    run(
        live,
        opened("invoice 4471", Amount="7200"),
        edit("invoice 4471", "Cost center", "", "4711", "e1", 2000),
    )
    live.hub.sent.clear()
    sent = run(
        live, edit("invoice 4471", "Cost center", "4711", "0400 - Capex equipment", "e1", 3000)
    )
    assert ("guardrail_resolved", {"guardrail_id": "g-capex-limit", "entity": "invoice 4471",
                                   "event_id": "e1", "ts_ms": 3000}) in sent  # fmt: skip


def test_save_triggered_guardrail_is_reported_before_the_save_then_resolved(live):
    sent = run(
        live,
        opened("invoice 4471", Amount="7200", **{"Asset number": ""}),
        edit("invoice 4471", "Cost center", "4711", "0400 - Capex equipment", "e1", 2000),
    )
    pre = [d for t, d in sent if t == "guardrail_hit" and d["guardrail_id"] == "g-asset-number"]
    assert [d["timing"] for d in pre] == ["pre_save"]  # once, not on every later event
    live.hub.sent.clear()
    sent = run(live, edit("invoice 4471", "Asset number", "", "AS-20931", "e2", 3000))
    assert [d["guardrail_id"] for t, d in sent if t == "guardrail_resolved"] == ["g-asset-number"]


def test_hit_carries_what_experts_said_before_about_the_supplier(tmp_path):
    store = SessionStore(tmp_path)
    store.create("tutor1", "tutor", {"work_map_id": expert_session(store)})
    graph = KnowledgeGraph(tmp_path / "graph.json")
    quote = {"text": "Weber always sends machines, check the asset tag.", "expert": "Anna",
             "session_id": "old", "date": "2026-10-01", "event_id": "x",
             "frame_ref": None}  # fmt: skip
    graph.add(["supplier:weber_maschinenbau", "field:cost_center"], "Why 0400 for Weber?", quote)
    live = LiveGuardrails(store, RecordingHub(), graph)
    ev = opened("invoice 4471", Supplier="Weber Maschinenbau", Amount="7200")
    store.append_event("tutor1", ev)  # nodes come from the entity's stored open event
    asyncio.run(
        live.on_events("tutor1", [ev, edit("invoice 4471", "Cost center", "", "4711", "e1", 2000)])
    )
    hit = next(d for _, t, d in live.hub.sent if t == "guardrail_hit")
    assert [k["text"] for k in hit["known"]] == [
        'Why 0400 for Weber? "Weber always sends machines, check the asset tag." (Anna, 2026-10-01)'
    ]


def test_non_tutor_sessions_are_not_evaluated(tmp_path):
    store = SessionStore(tmp_path)
    store.create("plain")
    live = LiveGuardrails(store, RecordingHub())
    asyncio.run(live.on_events("plain", [edit("invoice 4471", "Cost center", "", "4711", "e", 1)]))
    assert live.hub.sent == [] and store.guardrails("plain") == []


class _Pause:
    def detector(self, session_id):
        return self

    def on_screen_change(self, now) -> None:
        pass

    def clock(self) -> float:
        return 0.0


@pytest.fixture
def app(tmp_path):
    app = FastAPI()
    app.include_router(session_router)
    app.include_router(interviewer_router)
    app.include_router(workmap_router)
    app.state.store = SessionStore(tmp_path)
    app.state.hub = Hub()
    app.state.redactor = Redactor(app.state.store, Settings())
    app.state.guardrails = LiveGuardrails(app.state.store, app.state.hub)
    app.state.pause = _Pause()
    return app


def test_creating_a_tutor_session_requires_a_confirmed_map(app):
    c, store = TestClient(app), app.state.store
    assert c.post("/sessions", json={"role": "tutor"}).status_code == 422
    assert c.post("/sessions", json={"role": "tutor", "work_map_id": "nope"}).status_code == 404
    store.create("empty")
    assert c.post("/sessions", json={"role": "tutor", "work_map_id": "empty"}).status_code == 404
    store.create("draft")
    wm = json.loads(FIXTURE.read_text(encoding="utf-8")) | {"confirmed_at": None}
    (store.session_dir("draft") / WORKMAP_FILE).write_text(json.dumps(wm), encoding="utf-8")
    assert c.post("/sessions", json={"role": "tutor", "work_map_id": "draft"}).status_code == 409


def test_scripted_stream_reaches_the_websocket_before_any_save(app):
    """T-300 acceptance over the API: the stop arrives on the edit, with quote and frame."""
    c = TestClient(app)
    expert = expert_session(app.state.store)
    assert c.get(f"/sessions/{expert}/workmap").json()["confirmed_at"]
    tutor = c.post("/sessions", json={"role": "tutor", "work_map_id": expert}).json()["session_id"]
    assert c.get(f"/sessions/{tutor}").json()["work_map_id"] == expert
    with c.websocket_connect(f"/ws/session/{tutor}") as ws:
        assert ws.receive_json()["data"]["guardrails"] == []
        r = c.post(f"/events?session={tutor}", json=[
            opened("invoice 4471", Amount="EUR 7,200.00"),
            edit("invoice 4471", "Cost center", "", "4711 - Opex general", "e1", 2000),
        ])  # fmt: skip
        assert r.status_code == 200, r.text
        msgs = [ws.receive_json() for _ in range(2)]  # two events published first
        while not any(m["type"] == "guardrail_hit" for m in msgs):
            msgs.append(ws.receive_json())
    hit = next(m["data"] for m in msgs if m["type"] == "guardrail_hit")
    source = c.get(f"/sessions/{expert}/workmap").json()["session_id"]  # where its frames live
    assert hit["guardrail_id"] == "g-capex-limit" and hit["source_session_id"] == source
    assert not any(e["kind"] == "save" for e in c.get(f"/sessions/{tutor}/events").json())
    assert any(g["type"] == "guardrail_hit" for g in c.get(f"/sessions/{tutor}/guardrails").json())


def test_off_the_record_removes_guardrail_entries_in_the_window(app):
    c = TestClient(app)
    expert = expert_session(app.state.store)
    tutor = c.post("/sessions", json={"role": "tutor", "work_map_id": expert}).json()["session_id"]
    c.post(f"/events?session={tutor}", json=[
        opened("invoice 4471", ts=1000, Amount="7200"),
        edit("invoice 4471", "Cost center", "", "4711", "e1", 60000),
    ])  # fmt: skip
    assert c.get(f"/sessions/{tutor}/guardrails").json()
    c.post(f"/sessions/{tutor}/off-the-record", json={"seconds": 30})
    assert c.get(f"/sessions/{tutor}/guardrails").json() == []
