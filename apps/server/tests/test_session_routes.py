import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.privacy.redactor import Redactor
from apprentice.session.hub import Hub
from apprentice.session.routes import router
from apprentice.session.store import SessionStore
from apprentice.settings import Settings


@pytest.fixture
def app(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.state.store = SessionStore(tmp_path)
    app.state.hub = Hub()
    app.state.redactor = Redactor(app.state.store, Settings())
    return app


def test_create_get_and_errors(app):
    c = TestClient(app)
    sid = c.post("/sessions", json={"role": "expert"}).json()["session_id"]
    assert c.get(f"/sessions/{sid}").json()["role"] == "expert"
    assert c.post("/sessions").status_code == 200
    assert c.get("/sessions/missing").status_code == 404
    assert c.get("/sessions/bad.id/events").status_code == 422
    assert c.post("/sessions", json={"session_id": "../x"}).status_code == 422


def test_frame_served(app):
    c = TestClient(app)
    sid = c.post("/sessions").json()["session_id"]
    app.state.store.save_frame(sid, 5, b"\xff\xd8x")
    r = c.get(f"/sessions/{sid}/frames/0000000005.jpg")
    assert r.status_code == 200
    assert r.content == b"\xff\xd8x"
    assert c.get(f"/sessions/{sid}/frames/nope.jpg").status_code == 404


def test_two_ws_clients_identical(app):
    c = TestClient(app)
    sid = c.post("/sessions").json()["session_id"]
    with (
        c.websocket_connect(f"/ws/session/{sid}") as w1,
        c.websocket_connect(f"/ws/session/{sid}") as w2,
    ):
        s1, s2 = w1.receive_json(), w2.receive_json()
        assert s1["type"] == "snapshot"
        assert s1 == s2
        body = {"speaker": "expert", "ts_ms": 10, "text": "hello"}
        assert c.post(f"/sessions/{sid}/transcript", json=body).status_code == 200
        m1, m2 = w1.receive_json(), w2.receive_json()
        assert m1 == m2 == {"type": "transcript", "data": body}
    assert c.get(f"/sessions/{sid}/transcript").json() == [body]


def test_debrief_lines_kept_apart_from_capture_transcript(app):
    c = TestClient(app)
    sid = c.post("/sessions").json()["session_id"]
    body = {"speaker": "agent", "ts_ms": 1200, "text": "Why did you pick Replacement?"}
    assert c.post(f"/sessions/{sid}/debrief/transcript", json=body).status_code == 200
    assert c.get(f"/sessions/{sid}/debrief/transcript").json() == [body]
    assert c.get(f"/sessions/{sid}/transcript").json() == []
