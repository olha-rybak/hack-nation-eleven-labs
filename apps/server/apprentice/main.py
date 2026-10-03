"""FastAPI app: capture loop (frames -> events), session log, pause detector, interviewer test page.

Run (from apps/server):  uvicorn apprentice.main:app --port 8001  ->  http://localhost:8001/
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from apprentice import settings
from apprentice.capture.pause import PauseService
from apprentice.capture.routes import router as capture_router
from apprentice.capture.vision import VisionService
from apprentice.interviewer import router as interviewer_router
from apprentice.llm.client import LlmClient
from apprentice.session.hub import Hub
from apprentice.session.routes import router as session_router
from apprentice.session.store import SessionStore

HERE = Path(__file__).parent


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.llm = LlmClient()
    root = Path(settings.get_settings().SESSIONS_DIR)
    if not root.is_absolute():
        root = Path(settings.__file__).resolve().parents[3] / root
    app.state.store = SessionStore(root)
    app.state.hub = Hub()
    s = settings.get_settings()
    pause = app.state.pause = PauseService(app.state.store, app.state.hub, s)

    def event_seen(session_id: str) -> None:  # an accepted event is screen activity
        pause.detector(session_id).on_screen_change(pause.clock())

    app.state.vision = VisionService(app.state.llm, app.state.store, app.state.hub, s, event_seen)
    yield
    pause.stop_all()
    await app.state.llm.aclose()


app = FastAPI(title="AI Apprentice", lifespan=lifespan)
app.include_router(session_router)
app.include_router(capture_router)
app.include_router(interviewer_router)
app.mount("/prompts", StaticFiles(directory=HERE / "prompts"), name="prompts")
app.mount("/fixtures", StaticFiles(directory=HERE.parent / "fixtures"), name="fixtures")


@app.get("/")
def interviewer_page() -> FileResponse:
    return FileResponse(HERE / "static" / "interviewer.html")


def get_llm(request: Request) -> LlmClient:
    return request.app.state.llm


@app.get("/health")
async def health(llm: LlmClient = Depends(get_llm)) -> dict:
    return {"server": "ok", "model": "ok" if await llm.ping() else "down"}
