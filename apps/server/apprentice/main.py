"""FastAPI app: capture loop (frames -> events), session log, pause detector, interviewer test page.

Run (from apps/server):  uvicorn apprentice.main:app --port 8001  ->  http://localhost:8001/
"""

import asyncio
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
from apprentice.environment import get_brief, load_pack
from apprentice.environment_routes import router as environment_router
from apprentice.interviewer import router as interviewer_router
from apprentice.knowledge.graph import KnowledgeGraph
from apprentice.knowledge.routes import router as knowledge_router
from apprentice.llm.claude_vision import ClaudeVisionClient
from apprentice.llm.client import LlmClient
from apprentice.llm.structured import structured_llm
from apprentice.privacy.redactor import Redactor
from apprentice.session.hub import Hub
from apprentice.session.routes import router as session_router
from apprentice.session.store import SessionStore
from apprentice.teach.routes import router as teach_router
from apprentice.workmap.routes import router as workmap_router

HERE = Path(__file__).parent


def repo_path(setting: str) -> Path:
    path = Path(setting)
    return path if path.is_absolute() else Path(settings.__file__).resolve().parents[3] / path


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    s = settings.get_settings()
    app.state.llm = ClaudeVisionClient(s) if s.VISION_PROVIDER == "anthropic" else LlmClient()
    app.state.store = SessionStore(repo_path(s.SESSIONS_DIR))
    app.state.knowledge = KnowledgeGraph(repo_path(s.KNOWLEDGE_PATH))
    app.state.hub = Hub()
    redactor = app.state.redactor = Redactor(app.state.store, s)
    await asyncio.to_thread(redactor.warm_up)
    pause = app.state.pause = PauseService(
        app.state.store, app.state.hub, s, knowledge=app.state.knowledge
    )

    def event_seen(session_id: str) -> None:  # an accepted event is screen activity
        pause.detector(session_id).on_screen_change(pause.clock())

    app.state.vision = VisionService(
        app.state.llm, app.state.store, app.state.hub, s, redactor, event_seen
    )
    app.state.map_llm = structured_llm(s)
    app.state.environment_brief = None
    app.state.environment_hash = None
    brief_task = None
    pack = load_pack(repo_path(s.ENVIRONMENT_DIR))
    if pack:
        app.state.environment_hash = pack.hash

        async def prime() -> None:
            brief = await get_brief(pack, app.state.map_llm, repo_path(s.ENVIRONMENT_CACHE_DIR))
            app.state.environment_brief = app.state.vision.brief = brief

        brief_task = asyncio.create_task(prime())
    yield
    if brief_task:
        brief_task.cancel()
    await app.state.map_llm.aclose()
    pause.stop_all()
    await app.state.llm.aclose()


app = FastAPI(title="AI Apprentice", lifespan=lifespan)
app.include_router(session_router)
app.include_router(capture_router)
app.include_router(interviewer_router)
app.include_router(workmap_router)
app.include_router(knowledge_router)
app.include_router(teach_router)
app.include_router(environment_router)
app.mount("/prompts", StaticFiles(directory=HERE / "prompts"), name="prompts")
app.mount("/fixtures", StaticFiles(directory=HERE.parent / "fixtures"), name="fixtures")


@app.get("/")
def interviewer_page() -> FileResponse:
    return FileResponse(HERE / "static" / "interviewer.html")


def get_llm(request: Request) -> LlmClient:
    return request.app.state.llm


@app.get("/health")
async def health(request: Request, llm: LlmClient = Depends(get_llm)) -> dict:
    return {
        "server": "ok",
        "model": "ok" if await llm.ping() else "down",
        "presidio": request.app.state.redactor.status(),
    }
