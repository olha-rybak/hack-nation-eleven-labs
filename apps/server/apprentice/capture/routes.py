from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from apprentice.capture.vision import Frame

router = APIRouter()

SESSION_ID = r"^[A-Za-z0-9_-]{1,64}$"


@router.post("/ingest/frame", status_code=202)
async def ingest_frame(
    request: Request,
    session_id: str = Query(pattern=SESSION_ID),
    frame_ts: int = Query(ge=0, description="ms since session start, monotonic"),
) -> dict:
    """Raw JPEG/PNG body = a changed frame. Empty body = frame existed but was unchanged."""
    store, vision, pause = (
        request.app.state.store,
        request.app.state.vision,
        request.app.state.pause,
    )
    if not store.exists(session_id):
        store.create(session_id)
    det = pause.detector(session_id)  # starts the ask-now ticker on the first frame
    image = await request.body()
    if not image:
        store.record_tick(session_id, frame_ts)
        return {"frame_ref": None}
    if not (image.startswith(b"\xff\xd8") or image.startswith(b"\x89PNG")):
        raise HTTPException(415, "body must be a JPEG or PNG image")
    det.on_screen_change(pause.clock())
    ref = store.save_frame(session_id, frame_ts, image)
    vision.submit(session_id, Frame(frame_ts, ref, image))
    return {"frame_ref": ref}


class Signals(BaseModel):
    """Voice state from the browser (ElevenLabs SDK / VAD). Send on every change."""

    user_speaking: bool | None = None
    agent_speaking: bool | None = None


@router.post("/sessions/{session_id}/signals", status_code=204)
async def signals(session_id: str, body: Signals, request: Request) -> None:
    store, pause = request.app.state.store, request.app.state.pause
    try:
        found = store.exists(session_id)
    except ValueError:
        raise HTTPException(422, "invalid session id") from None
    if not found:
        raise HTTPException(404, "unknown session")
    det = pause.detector(session_id)
    if body.user_speaking is not None:
        det.on_user_speech(pause.clock(), body.user_speaking)
    if body.agent_speaking is not None:
        det.on_agent_speech(body.agent_speaking)


@router.post("/sessions/{session_id}/end", status_code=204)
async def end_capture(session_id: str, request: Request) -> None:
    """Stop the live ask-now loop (End task). The session log stays."""
    request.app.state.pause.stop(session_id)


@router.get("/sessions/{session_id}/pause-log")
async def pause_log(session_id: str, request: Request) -> list[dict]:
    try:
        return request.app.state.store.pause_log(session_id)
    except ValueError:
        raise HTTPException(422, "invalid session id") from None
    except KeyError:
        raise HTTPException(404, "unknown session") from None
