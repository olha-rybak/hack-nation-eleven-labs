"""Redaction enabled but Presidio not installed: the server must keep working, unredacted."""

from fastapi.testclient import TestClient

from apprentice.main import app
from apprentice.privacy.redactor import Redactor
from apprentice.session.store import SessionStore
from apprentice.settings import Settings


def missing(*_args):
    raise ModuleNotFoundError("No module named 'presidio_analyzer'")


def test_missing_presidio_switches_redaction_off(tmp_path, monkeypatch):
    monkeypatch.setattr("apprentice.privacy.redactor._build_analyzer", missing)
    r = Redactor(SessionStore(tmp_path), Settings(PRESIDIO_ENABLED=True))
    r.warm_up()
    ev = {"entity": "Anna Schmidt"}
    assert r.text("s1", "Call Anna Schmidt") == "Call Anna Schmidt"
    assert r.event("s1", ev) is ev
    assert r.image("s1", b"not a jpeg") == b"not a jpeg"
    assert r.status() == "unavailable"


def test_missing_spacy_model_switches_redaction_off(tmp_path, monkeypatch):
    def no_model(*_args):
        raise OSError("[E050] Can't find model 'en_core_web_lg'")

    monkeypatch.setattr("apprentice.privacy.redactor._build_analyzer", no_model)
    r = Redactor(SessionStore(tmp_path), Settings(PRESIDIO_ENABLED=True))
    assert r.text("s1", "Anna") == "Anna"
    assert r.status() == "unavailable"


def test_server_stores_text_without_presidio(tmp_path, monkeypatch):
    monkeypatch.setattr("apprentice.privacy.redactor._build_analyzer", missing)
    with TestClient(app) as client:
        app.state.store = SessionStore(tmp_path)
        app.state.redactor = Redactor(app.state.store, Settings(PRESIDIO_ENABLED=True))
        sid = client.post("/sessions").json()["session_id"]
        body = {"speaker": "expert", "ts_ms": 1, "text": "Call Anna Schmidt"}
        r = client.post(f"/sessions/{sid}/transcript", json=body)
        assert r.status_code == 200 and r.json()["text"] == "Call Anna Schmidt"
        assert client.get("/health").json()["presidio"] == "unavailable"
