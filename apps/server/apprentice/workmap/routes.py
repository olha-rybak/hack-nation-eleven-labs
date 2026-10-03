import json

from fastapi import APIRouter, HTTPException, Request

from apprentice.llm.structured import StructuredLlmError
from apprentice.workmap.builder import build_draft
from apprentice.workmap.draft import DraftWorkMap

router = APIRouter()

DRAFT_FILE = "workmap_draft.json"


def _session_dir(request: Request, session_id: str):
    store = request.app.state.store
    try:
        return store.session_dir(session_id)
    except ValueError:
        raise HTTPException(422, "invalid session id") from None
    except KeyError:
        raise HTTPException(404, "unknown session") from None


@router.post("/sessions/{session_id}/workmap/draft")
async def create_draft(session_id: str, request: Request) -> DraftWorkMap:
    """End task: build the draft Work Map and the ranked gap list the debrief works from."""
    d = _session_dir(request, session_id)
    store = request.app.state.store
    try:
        draft = await build_draft(
            request.app.state.map_llm, session_id, store.events(session_id),
            store.transcript(session_id),
        )  # fmt: skip
    except (StructuredLlmError, ValueError) as e:
        raise HTTPException(502, f"could not build a draft: {e}") from None
    (d / DRAFT_FILE).write_text(draft.model_dump_json(indent=2), encoding="utf-8")
    return draft


@router.get("/sessions/{session_id}/workmap/draft")
def get_draft(session_id: str, request: Request) -> DraftWorkMap:
    path = _session_dir(request, session_id) / DRAFT_FILE
    if not path.is_file():
        raise HTTPException(404, "no draft yet; POST to build one")
    return DraftWorkMap.model_validate(json.loads(path.read_text(encoding="utf-8")))
