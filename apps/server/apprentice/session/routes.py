from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError

from apprentice.capture.events import Event
from apprentice.session.hub import Hub
from apprentice.session.store import SessionStore
from apprentice.settings import get_settings

router = APIRouter()


def get_store(request: Request) -> SessionStore:
    return request.app.state.store


def get_hub(request: Request) -> Hub:
    return request.app.state.hub


class CreateBody(BaseModel):
    session_id: str | None = None
    role: str = "interviewer"


class TranscriptBody(BaseModel):
    speaker: str
    ts_ms: int
    text: str


class EventCorrection(BaseModel):
    """What the expert can fix about an event from the capture panel."""

    entity: str | None = None
    field: str | None = None
    before: str | None = None
    after: str | None = None


class OffRecordBody(BaseModel):
    until_ts: int = Field(ge=0, description="the client's current frame_ts")


def _require(store: SessionStore, session_id: str) -> None:
    try:
        found = store.exists(session_id)
    except ValueError:
        raise HTTPException(422, "invalid session id") from None
    if not found:
        raise HTTPException(404, "unknown session")


@router.post("/sessions")
async def create_session(
    body: CreateBody | None = None, store: SessionStore = Depends(get_store)
) -> dict:
    body = body or CreateBody()
    try:
        sid = store.create(body.session_id, body.role)
    except ValueError:
        raise HTTPException(422, "invalid session id") from None
    return {"session_id": sid}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, store: SessionStore = Depends(get_store)) -> dict:
    _require(store, session_id)
    return store.meta(session_id)


@router.get("/sessions/{session_id}/events")
async def get_events(session_id: str, store: SessionStore = Depends(get_store)) -> list[dict]:
    _require(store, session_id)
    return store.events(session_id)


@router.get("/sessions/{session_id}/transcript")
async def get_transcript(session_id: str, store: SessionStore = Depends(get_store)) -> list[dict]:
    _require(store, session_id)
    return store.transcript(session_id)


@router.post("/sessions/{session_id}/transcript")
async def post_transcript(
    session_id: str,
    body: TranscriptBody,
    store: SessionStore = Depends(get_store),
    hub: Hub = Depends(get_hub),
) -> dict:
    _require(store, session_id)
    line = body.model_dump()
    if store.append_transcript(session_id, line):
        await hub.publish(session_id, "transcript", line)
    return line


@router.patch("/sessions/{session_id}/events/{event_id}")
async def correct_event(
    session_id: str,
    event_id: str,
    body: EventCorrection,
    store: SessionStore = Depends(get_store),
    hub: Hub = Depends(get_hub),
) -> dict:
    """The expert fixes what the apprentice saw. Re-appended under the same id: the store
    folds by id, so the correction replaces the event in place and the log stays append-only."""
    _require(store, session_id)
    current = next((e for e in store.events(session_id) if e.get("id") == event_id), None)
    if current is None:
        raise HTTPException(404, "unknown event")
    patch = body.model_dump(exclude_unset=True)
    try:
        corrected = Event.model_validate({**current, **patch}).model_dump()
    except ValidationError as e:
        raise HTTPException(422, str(e)) from None
    corrected["corrected"] = True
    store.append_event(session_id, corrected)
    await hub.publish(session_id, "event", corrected)
    return corrected


@router.post("/sessions/{session_id}/off-the-record")
async def off_the_record(
    session_id: str,
    body: OffRecordBody,
    request: Request,
    store: SessionStore = Depends(get_store),
    hub: Hub = Depends(get_hub),
) -> dict:
    """Delete the last OFF_THE_RECORD_WINDOW_SEC of frames, events and transcript."""
    _require(store, session_id)
    window_ms = round(get_settings().OFF_THE_RECORD_WINDOW_SEC * 1000)
    removed = store.delete_window(session_id, body.until_ts, window_ms)
    await hub.publish(session_id, "off_record", removed)
    return removed


@router.get("/sessions/{session_id}/frames/{name}")
async def get_frame(
    session_id: str, name: str, store: SessionStore = Depends(get_store)
) -> FileResponse:
    _require(store, session_id)
    try:
        path = store.frame_path(session_id, f"frames/{name}")
    except ValueError:
        raise HTTPException(422, "invalid frame name") from None
    if not path.is_file():
        raise HTTPException(404, "unknown frame")
    return FileResponse(path, media_type="image/jpeg")


@router.websocket("/ws/session/{session_id}")
async def session_ws(websocket: WebSocket, session_id: str) -> None:
    store: SessionStore = websocket.app.state.store
    hub: Hub = websocket.app.state.hub
    try:
        found = store.exists(session_id)
    except ValueError:
        found = False
    if not found:
        await websocket.close(code=4404)
        return
    await hub.connect(session_id, websocket)
    try:
        await websocket.send_json(
            {
                "type": "snapshot",
                "data": {
                    "events": store.events(session_id),
                    "transcript": store.transcript(session_id),
                },
            }
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(session_id, websocket)
