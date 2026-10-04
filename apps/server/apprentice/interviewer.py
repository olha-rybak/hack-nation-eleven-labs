"""`/events` for the interviewer test page (static/interviewer.html), backed by the session store.

The page polls `GET /events?since=n` and forwards new events to the ElevenLabs agent. Vision events
from `/ingest/frame` land in the same session, so the page sees real screen events unchanged. Hand-
written events (fixtures, curl) can still be posted to `POST /events`.
"""

import asyncio

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import ValidationError

from apprentice.capture.events import Event
from apprentice.settings import get_settings

router = APIRouter()

LIVE_SESSION = "live"  # the session the test page and the capture script share by default
SESSION_ID = r"^[A-Za-z0-9_-]{1,64}$"


@router.get("/config")
def config() -> dict:
    """Public settings for the web app. Agent IDs are not secrets (the agents are public)."""
    s = get_settings()
    return {
        "agent_id": s.ELEVENLABS_INTERVIEWER_AGENT_ID,
        "debrief_agent_id": s.ELEVENLABS_DEBRIEF_AGENT_ID or s.ELEVENLABS_INTERVIEWER_AGENT_ID,
        # a debrief agent has the debrief prompt in its dashboard; the interviewer needs it sent
        "debrief_prompt_override": not s.ELEVENLABS_DEBRIEF_AGENT_ID,
    }


@router.post("/events")
async def add_events(
    body: dict | list[dict],
    request: Request,
    session: str = Query(LIVE_SESSION, pattern=SESSION_ID),
) -> dict:
    store, hub, redactor = (
        request.app.state.store,
        request.app.state.hub,
        request.app.state.redactor,
    )
    if not store.exists(session):
        store.create(session)
    try:
        events = [Event.model_validate(e) for e in (body if isinstance(body, list) else [body])]
    except ValidationError as e:
        raise HTTPException(422, str(e)) from None
    accepted = []
    for ev in events:
        redacted = await asyncio.to_thread(redactor.event, session, ev.model_dump())
        store.append_event(session, redacted)
        await hub.publish(session, "event", redacted)
        accepted.append(redacted)
    if live := getattr(request.app.state, "guardrails", None):
        await live.on_events(session, accepted)  # scripted event streams reach the tutor too
    request.app.state.pause.detector(session).on_screen_change(request.app.state.pause.clock())
    return {"events": len(store.events(session))}


@router.get("/events")
def list_events(
    request: Request, since: int = 0, session: str = Query(LIVE_SESSION, pattern=SESSION_ID)
) -> list[dict]:
    """Events from index `since` on. A merged edit updates its earlier position, not the tail."""
    store = request.app.state.store
    return store.events(session)[since:] if store.exists(session) else []


@router.delete("/events")
def clear_events(request: Request, session: str = Query(LIVE_SESSION, pattern=SESSION_ID)) -> dict:
    """Start over: the old session is archived under a new name, not deleted."""
    store, pause = request.app.state.store, request.app.state.pause
    if store.exists(session):
        pause.stop(session)
        request.app.state.vision.reset(session)
        store.archive(session)
    return {"events": 0}
