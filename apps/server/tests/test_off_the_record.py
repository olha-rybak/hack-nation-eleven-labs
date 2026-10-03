import pytest
from fastapi.testclient import TestClient

from apprentice.capture.pause import PauseService
from apprentice.main import app
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

SECRETS = ("Weber Maschinenbau", "SECRET-IBAN")


def seed(store: SessionStore, sid: str = "s1") -> None:
    store.create(sid)
    for sec in range(0, 61, 5):
        ts = sec * 1000
        if sec % 10 == 0:
            store.save_frame(sid, ts, b"jpeg-" + str(sec).encode())
        else:
            store.record_tick(sid, ts)
        text = "Weber Maschinenbau" if sec >= 30 else "Lieferant Muster"
        store.append_event(
            sid,
            {
                "id": f"e{sec}",
                "ts_ms": ts,
                "kind": "edit",
                "after": text,
                "frame_ref": f"frames/{ts:010d}.jpg" if sec % 10 == 0 else None,
            },
        )
        store.append_transcript(
            sid, {"speaker": "expert", "ts_ms": ts, "text": "SECRET-IBAN" if sec >= 30 else "hallo"}
        )
        store.append_pause_log(sid, {"t": sec, "ask_now": {"event_id": f"e{sec}", "subject": text}})


def all_bytes(root) -> bytes:
    return b"".join(p.read_bytes() for p in root.rglob("*") if p.is_file())


def test_nothing_from_the_window_remains_on_disk(tmp_path):
    store = SessionStore(tmp_path)
    seed(store)
    result = store.delete_window("s1", 30)
    assert result["from_ts_ms"] == 30000
    assert (result["frames"], result["events"], result["transcript"]) == (7, 7, 7)
    blob = all_bytes(tmp_path / "s1")
    for secret in SECRETS:
        assert secret.encode() not in blob
    frames = sorted(p.name for p in (tmp_path / "s1" / "frames").iterdir())
    assert frames == [f"{s * 1000:010d}.jpg" for s in (0, 10, 20)]
    assert max(f["ts_ms"] for f in store.frames("s1")) == 25000


def test_unreferenced_frame_file_in_window_is_removed(tmp_path):
    store = SessionStore(tmp_path)
    seed(store)
    orphan = tmp_path / "s1" / "frames" / "0000055000.jpg"
    orphan.write_bytes(b"x")
    store.delete_window("s1", 30)
    assert not orphan.exists()


def test_merged_edit_reverts_to_pre_cutoff_version(tmp_path):
    store = SessionStore(tmp_path)
    store.create("s1")
    store.append_event("s1", {"id": "x", "ts_ms": 10000, "after": "04"})
    store.append_event("s1", {"id": "x", "ts_ms": 50000, "after": "0400"})
    store.append_pause_log("s1", {"ask_now": {"event_id": "x", "subject": "changed to '0400'"}})
    result = store.delete_window("s1", 30)
    assert result["events"] == 1
    assert result["deleted_event_ids"] == []
    assert result["reverted_events"] == [{"id": "x", "ts_ms": 10000, "after": "04"}]
    assert store.events("s1") == [{"id": "x", "ts_ms": 10000, "after": "04"}]
    assert store.pause_log("s1") == []  # its subject quoted the off-the-record value


def test_event_born_in_window_is_deleted_with_its_pause_entry(tmp_path):
    store = SessionStore(tmp_path)
    store.create("s1")
    store.append_event("s1", {"id": "old", "ts_ms": 1000, "after": "a"})
    store.append_event("s1", {"id": "new", "ts_ms": 50000, "after": "b"})
    store.append_pause_log("s1", {"ask_now": {"event_id": "old", "subject": "a"}})
    store.append_pause_log("s1", {"ask_now": {"event_id": "new", "subject": "b"}})
    store.append_pause_log("s1", {"near_miss": True})
    result = store.delete_window("s1", 30)
    assert result["deleted_event_ids"] == ["new"]
    assert store.pause_log("s1") == [
        {"ask_now": {"event_id": "old", "subject": "a"}},
        {"near_miss": True},
    ]


def test_empty_session_deletes_nothing(tmp_path):
    store = SessionStore(tmp_path)
    store.create("s1")
    result = store.delete_window("s1", 30)
    assert result["frames"] == result["events"] == result["transcript"] == 0
    assert result["deleted_event_ids"] == []


def test_unparseable_lines_are_dropped_and_tmp_never_remains(tmp_path):
    store = SessionStore(tmp_path)
    store.create("s1")
    store.append_transcript("s1", {"speaker": "expert", "ts_ms": 1000, "text": "hi"})
    store.append_transcript("s1", {"speaker": "expert", "ts_ms": 100000, "text": "bye"})
    with open(tmp_path / "s1" / "transcript.jsonl", "a", encoding="utf-8") as f:
        f.write("{broken\n")
    store.delete_window("s1", 30)
    assert (tmp_path / "s1" / "transcript.jsonl").read_text(encoding="utf-8").count("\n") == 1
    assert not list((tmp_path / "s1").glob("*.tmp"))


class StubVision:
    def __init__(self):
        self.reset_calls = []

    def reset(self, session_id):
        self.reset_calls.append(session_id)


@pytest.fixture
def api(tmp_path):
    with TestClient(app) as client:
        app.state.pause.stop_all()
        app.state.store = SessionStore(tmp_path)
        app.state.pause = PauseService(app.state.store, app.state.hub, Settings())
        app.state.vision = StubVision()
        yield client


def test_route_deletes_publishes_and_resets_vision(api, tmp_path):
    seed(app.state.store)
    with api.websocket_connect("/ws/session/s1") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        r = api.post("/sessions/s1/off-the-record", json={"seconds": 30})
        assert r.status_code == 200
        msg = ws.receive_json()
    assert r.json()["from_ts_ms"] == 30000
    assert r.json()["frames"] == 7
    assert msg == {"type": "deleted", "data": r.json()}
    assert app.state.vision.reset_calls == ["s1"]
    assert b"SECRET-IBAN" not in all_bytes(tmp_path / "s1")


def test_route_defaults_to_settings_window(api, monkeypatch):
    seed(app.state.store)
    monkeypatch.setattr(
        "apprentice.session.routes.settings.get_settings",
        lambda: Settings(OFF_THE_RECORD_WINDOW_SEC=10),
    )
    assert api.post("/sessions/s1/off-the-record").json()["from_ts_ms"] == 50000


def test_route_unknown_and_invalid_session(api):
    assert api.post("/sessions/nope/off-the-record").status_code == 404
    assert api.post("/sessions/bad id/off-the-record").status_code == 422
