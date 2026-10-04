from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/environment/brief")
def get_environment_brief(request: Request) -> dict:
    """The priming brief the interviewer gets at session start; ready once it has been written."""
    brief = request.app.state.environment_brief
    return {
        "hash": request.app.state.environment_hash,
        "brief": brief,
        "ready": brief is not None,
    }
