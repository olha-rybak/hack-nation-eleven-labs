"""`/events` for the interviewer test page (static/interviewer.html), backed by the session store.

The page polls `GET /events?since=n` and forwards new events to the ElevenLabs agent. Vision events
from `/ingest/frame` land in the same session, so the page sees real screen events unchanged. Hand-
written events (fixtures, curl) can still be posted to `POST /events`.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import ValidationError

from apprentice.capture.events import Event

router = APIRouter()

LIVE_SESSION = "live"  # the session the test page and the capture script share by default
SESSION_ID = r"^[A-Za-z0-9_-]{1,64}$"


@router.post("/events")
async def add_events(
    body: dict | list[dict],
    request: Request,
    session: str = Query(LIVE_SESSION, pattern=SESSION_ID),
) -> dict:
    store, hub = request.app.state.store, request.app.state.hub
    if not store.exists(session):
        store.create(session)
    try:
        events = [Event.model_validate(e) for e in (body if isinstance(body, list) else [body])]
    except ValidationError as e:
        raise HTTPException(422, str(e)) from None
    for ev in events:
        store.append_event(session, ev.model_dump())
        await hub.publish(session, "event", ev.model_dump())
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
