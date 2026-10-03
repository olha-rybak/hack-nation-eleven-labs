"""FastAPI app: event intake from the vision step, plus the interviewer test page.

The LLM runs inside ElevenLabs (built-in Claude). The page connects to the agent, forwards events as
contextual updates and sends the ASK_NOW cue. MVP: one in-memory event list, no sessions (T-105).

Run:  uvicorn apprentice.main:app --reload --port 8001   →  http://localhost:8001/
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).parent
ENV_FILE = HERE.parents[2] / ".env"


def env(name: str) -> str:
    """Process environment first, then the repo-root .env."""
    if name in os.environ:
        return os.environ[name]
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == name:
                return value.strip().strip("\"'")
    return ""


app = FastAPI(title="AI Apprentice")
app.mount("/prompts", StaticFiles(directory=HERE / "prompts"), name="prompts")
app.mount("/fixtures", StaticFiles(directory=HERE.parent / "fixtures"), name="fixtures")

EVENTS: list[dict] = []


@app.get("/")
def interviewer_page() -> FileResponse:
    return FileResponse(HERE / "static" / "interviewer.html")


@app.get("/health")
def health() -> dict:
    return {"server": "ok", "events": len(EVENTS)}


@app.get("/config")
def config() -> dict:
    """Public settings for the test page. The agent ID is not a secret (the agent is public)."""
    return {"agent_id": env("ELEVENLABS_INTERVIEWER_AGENT_ID")}


@app.post("/events")
def add_events(body: dict | list[dict]) -> dict:
    """The vision step posts one event or a list of events here (schema: T-103)."""
    EVENTS.extend(body if isinstance(body, list) else [body])
    return {"events": len(EVENTS)}


@app.get("/events")
def list_events(since: int = 0) -> list[dict]:
    """Events from index `since` on, so the page can poll for new ones."""
    return EVENTS[since:]


@app.delete("/events")
def clear_events() -> dict:
    EVENTS.clear()
    return {"events": 0}
