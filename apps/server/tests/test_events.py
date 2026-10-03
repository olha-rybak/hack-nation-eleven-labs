import json
from pathlib import Path

from fastapi.testclient import TestClient

from apprentice.main import app

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "events.json").read_text())
api = TestClient(app)


def test_events_poll_returns_only_new_ones():
    api.delete("/events")
    api.post("/events", json=FIXTURE[:3])
    api.post("/events", json=FIXTURE[3])
    assert len(api.get("/events").json()) == 4
    assert api.get("/events", params={"since": 3}).json() == [FIXTURE[3]]


def test_page_prompts_and_fixtures_are_served():
    assert "Conversation.startSession" in api.get("/").text
    assert "ASK_NOW" in api.get("/prompts/interviewer/system.md").text
    assert api.get("/prompts/interviewer/ask_now.md").text.strip() == "ASK_NOW"
    assert api.get("/fixtures/events.json").json() == FIXTURE


def test_config_returns_agent_id_from_environment(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_INTERVIEWER_AGENT_ID", "agent_test")
    assert api.get("/config").json() == {"agent_id": "agent_test"}
