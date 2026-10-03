import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.session.hub import Hub
from apprentice.session.routes import router
from apprentice.session.store import SessionStore


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
def store(tmp_path):
    return SessionStore(tmp_path)


@pytest.fixture
def filled(store):
    sid = store.create("s1", "expert")
    for ts in (1_000, 20_000, 45_000, 60_000):
        marker = "WINDOW" if 30_000 <= ts <= 60_000 else "outside"
        store.save_frame(sid, ts, b"\xff\xd8" + f"{marker}-{ts}".encode())
        store.record_tick(sid, ts + 500)
    store.append_event(sid, _event("old", 20_000, after="0410"))
    store.append_event(sid, _event("new", 45_000, after="WINDOW-NEW"))
    store.append_transcript(sid, {"speaker": "expert", "ts_ms": 21_000, "text": "kept line"})
    store.append_transcript(sid, {"speaker": "expert", "ts_ms": 50_000, "text": "WINDOW line"})
    store.append_pause_log(
        sid, {"t": 46.0, "ask_now": {"subject": "WINDOW-NEW", "event_id": "new"}}
    )
    store.append_pause_log(sid, {"t": 21.0, "ask_now": {"subject": "old", "event_id": "old"}})
    return sid


def test_delete_window_removes_everything_in_range_from_disk(store, filled, tmp_path):
    removed = store.delete_window(filled, until_ts=60_000, window_ms=30_000)

    assert (removed["from_ts"], removed["until_ts"]) == (30_000, 60_000)
    assert removed == {**removed, "frames": 3, "events": 1, "transcript": 1, "event_ids": ["new"]}
    # 60_500 is after until_ts, so that tick is kept: the window is inclusive on both ends only.
    assert [f["ts_ms"] for f in store.frames(filled)] == [1_000, 1_500, 20_000, 20_500, 60_500]
    assert [e["id"] for e in store.events(filled)] == ["old"]
    assert [t["text"] for t in store.transcript(filled)] == ["kept line"]
    assert [p["ask_now"]["event_id"] for p in store.pause_log(filled)] == ["old"]
    frames = sorted(p.name for p in (tmp_path / filled / "frames").iterdir())
    assert frames == ["0000001000.jpg", "0000020000.jpg"]
    # The T-400 acceptance: nothing from the window is left anywhere in the session folder.
    for path in (tmp_path / filled).rglob("*"):
        if path.is_file():
            assert b"WINDOW" not in path.read_bytes(), path


def test_late_arrivals_inside_the_window_are_dropped(store, filled):
    store.delete_window(filled, until_ts=60_000, window_ms=30_000)

    assert store.save_frame(filled, 59_000, b"\xff\xd8late") is None
    assert store.append_event(filled, _event("late", 58_000)) is False
    late_line = {"speaker": "x", "ts_ms": 31_000, "text": "late"}
    assert store.append_transcript(filled, late_line) is False
    store.record_tick(filled, 40_000)
    assert all(not 30_000 <= f["ts_ms"] <= 60_000 for f in store.frames(filled))

    # After the window, recording continues normally.
    assert store.save_frame(filled, 61_000, b"\xff\xd8after") == "frames/0000061000.jpg"
    assert store.append_event(filled, _event("after", 61_000)) is True


def test_delete_window_on_empty_session(store):
    sid = store.create("empty")
    removed = store.delete_window(sid, until_ts=5_000, window_ms=30_000)
    assert (removed["from_ts"], removed["frames"], removed["events"]) == (0, 0, 0)


@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.state.store = SessionStore(tmp_path)
    app.state.hub = Hub()
    return TestClient(app), app


def test_off_the_record_route_and_broadcast(client):
    c, app = client
    sid = c.post("/sessions", json={"role": "expert"}).json()["session_id"]
    app.state.store.append_event(sid, _event("e1", 50_000))
    with c.websocket_connect(f"/ws/session/{sid}") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        r = c.post(f"/sessions/{sid}/off-the-record", json={"until_ts": 60_000})
        assert r.status_code == 200
        assert r.json()["event_ids"] == ["e1"]
        msg = ws.receive_json()
        assert msg["type"] == "off_record"
        assert msg["data"]["from_ts"] == 30_000
    assert c.get(f"/sessions/{sid}/events").json() == []
    assert c.post("/sessions/missing/off-the-record", json={"until_ts": 1}).status_code == 404
    assert c.post(f"/sessions/{sid}/off-the-record", json={"until_ts": -1}).status_code == 422


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
    assert c.patch(f"/sessions/{sid}/events/nope", json={"after": "x"}).status_code == 404


def test_transcript_inside_window_is_not_broadcast(client):
    c, app = client
    sid = c.post("/sessions").json()["session_id"]
    app.state.store.delete_window(sid, until_ts=60_000, window_ms=30_000)
    r = c.post(f"/sessions/{sid}/transcript", json={"speaker": "x", "ts_ms": 40_000, "text": "t"})
    assert r.status_code == 200
    assert c.get(f"/sessions/{sid}/transcript").json() == []
