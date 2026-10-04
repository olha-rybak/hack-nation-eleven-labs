import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apprentice.capture.pause import PauseService
from apprentice.capture.vision import VisionService
from apprentice.main import app
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "events.json").read_text())


@pytest.fixture
def api(tmp_path):
    with TestClient(app) as client:
        app.state.pause.stop_all()
        app.state.store = SessionStore(tmp_path)
        settings = Settings()
        app.state.pause = PauseService(app.state.store, app.state.hub, settings)
        app.state.vision = VisionService(
            app.state.llm, app.state.store, app.state.hub, settings, app.state.redactor
        )
        yield client


def strip_ids(events):
    return [{k: v for k, v in e.items() if k not in {"id", "fields"}} for e in events]


def test_events_poll_returns_only_new_ones(api):
    api.delete("/events")
    api.post("/events", json=FIXTURE[:3])
    api.post("/events", json=FIXTURE[3])
    assert len(api.get("/events").json()) == 4
    assert strip_ids(api.get("/events", params={"since": 3}).json()) == [FIXTURE[3]]


def test_clear_archives_instead_of_deleting(api, tmp_path):
    api.post("/events", json=FIXTURE[:2])
    api.delete("/events")
    assert api.get("/events").json() == []
    assert any(p.name.startswith("live-") for p in tmp_path.iterdir())


def test_page_prompts_and_fixtures_are_served(api):
    assert "Conversation.startSession" in api.get("/").text
    assert "ASK_NOW" in api.get("/prompts/interviewer/system.md").text
    assert api.get("/prompts/interviewer/ask_now.md").text.strip() == "ASK_NOW"
    assert api.get("/fixtures/events.json").json() == FIXTURE


def test_config_returns_agent_ids_from_settings(api, monkeypatch):
    configured = Settings(
        ELEVENLABS_INTERVIEWER_AGENT_ID="agent_test", ELEVENLABS_DEBRIEF_AGENT_ID=""
    )
    monkeypatch.setattr("apprentice.interviewer.get_settings", lambda: configured)
    assert api.get("/config").json() == {
        "agent_id": "agent_test",
        "debrief_agent_id": "agent_test",
        "debrief_prompt_override": True,
    }
    configured.ELEVENLABS_DEBRIEF_AGENT_ID = "agent_debrief"
    debrief = api.get("/config").json()
    assert debrief["debrief_agent_id"] == "agent_debrief" and not debrief["debrief_prompt_override"]
    assert "NEXT_GAP" in api.get("/prompts/debrief/system.md").text
