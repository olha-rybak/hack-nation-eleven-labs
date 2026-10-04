from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from apprentice.teach.report import ProgressReport, build_report
from apprentice.workmap.schema import WorkMap

router = APIRouter()

WORKMAP_FILE = "workmap.json"


@router.get("/sessions/{session_id}/report")
def get_report(session_id: str, workmap_session: str, request: Request) -> ProgressReport:
    """What the new hire handled, missed and should practice, against the expert's confirmed map."""
    store = request.app.state.store
    try:
        store.session_dir(session_id)
        path = store.session_dir(workmap_session) / WORKMAP_FILE
    except ValueError:
        raise HTTPException(422, "invalid session id") from None
    except KeyError:
        raise HTTPException(404, "unknown session") from None
    if not path.is_file():
        raise HTTPException(404, "no work map for that session")
    try:
        workmap = WorkMap.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as e:
        raise HTTPException(422, f"invalid work map: {e}") from None
    if workmap.confirmed_at is None:
        raise HTTPException(409, "work map is not confirmed")
    # The history, not the folded events: a fixed edit keeps its id, and the report must still see
    # the wrong value the new hire typed first.
    return build_report(workmap, store.event_history(session_id))
