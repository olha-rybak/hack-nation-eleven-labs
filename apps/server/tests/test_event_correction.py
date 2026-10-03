import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.privacy.redactor import Redactor
from apprentice.session.hub import Hub
from apprentice.session.routes import router
from apprentice.session.store import SessionStore
from apprentice.settings import Settings


def _event(id_, ts, after="0400"):
    return {
        "id": id_,
        "ts_ms": ts,
        "kind": "edit",
        "entity": "INV-4471",
        "field": "cost center",
        "before": "4711",
        "after": after,
        "confidence": 0.9,
        "frame_ref": f"frames/{ts:010d}.jpg",
    }


@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.state.store = SessionStore(tmp_path)
    app.state.hub = Hub()
    app.state.redactor = Redactor(app.state.store, Settings())
    return TestClient(app), app


def test_correct_event_replaces_in_place_and_broadcasts(client):
    c, app = client
    sid = c.post("/sessions").json()["session_id"]
    app.state.store.append_event(sid, _event("e1", 1_000, after="0400"))
    app.state.store.append_event(sid, _event("e2", 2_000))
    with c.websocket_connect(f"/ws/session/{sid}") as ws:
        ws.receive_json()
        r = c.patch(f"/sessions/{sid}/events/e1", json={"after": "0410"})
        assert r.status_code == 200
        assert ws.receive_json() == {"type": "event", "data": r.json()}
    events = c.get(f"/sessions/{sid}/events").json()
    assert [e["id"] for e in events] == ["e1", "e2"]
    first = events[0]
    assert (first["after"], first["before"], first["corrected"]) == ("0410", "4711", True)


def test_correct_event_errors(client):
    c, app = client
    sid = c.post("/sessions").json()["session_id"]
    app.state.store.append_event(sid, _event("e1", 1_000))
    assert c.patch(f"/sessions/{sid}/events/nope", json={"after": "x"}).status_code == 404
    assert c.patch("/sessions/missing/events/e1", json={"after": "x"}).status_code == 404
    bad = c.patch(f"/sessions/{sid}/events/e1", json={"entity": None})
    assert bad.status_code == 422
