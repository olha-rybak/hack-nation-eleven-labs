import json
from datetime import date

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from apprentice.knowledge.graph import nodes_for_event
from apprentice.llm.structured import StructuredLlmError
from apprentice.settings import get_settings
from apprentice.workmap import debrief
from apprentice.workmap.builder import build_draft
from apprentice.workmap.draft import DraftWorkMap, Gap, GapClosed
from apprentice.workmap.schema import Quote, WorkMap

router = APIRouter()

DRAFT_FILE = "workmap_draft.json"
WORKMAP_FILE = "workmap.json"


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


def _load_draft(request: Request, session_id: str) -> DraftWorkMap:
    path = _session_dir(request, session_id) / DRAFT_FILE
    if not path.is_file():
        raise HTTPException(404, "no draft yet; POST to build one")
    return DraftWorkMap.model_validate(json.loads(path.read_text(encoding="utf-8")))


def _save_draft(request: Request, session_id: str, draft: DraftWorkMap) -> None:
    (_session_dir(request, session_id) / DRAFT_FILE).write_text(
        draft.model_dump_json(indent=2), encoding="utf-8"
    )


@router.get("/sessions/{session_id}/workmap/draft")
def get_draft(session_id: str, request: Request) -> DraftWorkMap:
    return _load_draft(request, session_id)


@router.get("/sessions/{session_id}/workmap")
def get_workmap(session_id: str, request: Request) -> WorkMap:
    path = _session_dir(request, session_id) / WORKMAP_FILE
    if not path.is_file():
        raise HTTPException(404, "no Work Map yet; it is made when the debrief finishes")
    return WorkMap.model_validate(json.loads(path.read_text(encoding="utf-8")))


@router.get("/sessions/{session_id}/debrief")
async def debrief_status(session_id: str, request: Request) -> debrief.DebriefStatus:
    """The next gap to ask, how many are left, and whether the debrief is done."""
    draft = _load_draft(request, session_id)
    asked_live = debrief.guardrail_asked_live(request.app.state.store.pause_log(session_id))
    if debrief.ensure_guardrail_gap(draft, asked_live):
        _save_draft(request, session_id, draft)
    return debrief.status(draft, asked_live, get_settings().DEBRIEF_MIN_IMPORTANCE)


class FinishedDebrief(BaseModel):
    workmap: WorkMap
    left_out: list[str]  # steps and guardrails dropped because the expert never explained them


@router.post("/sessions/{session_id}/debrief/finish")
async def finish_debrief(session_id: str, request: Request) -> FinishedDebrief:
    """End the debrief, whether it is done or the expert stopped it, and save the Work Map."""
    draft = _load_draft(request, session_id)
    try:
        workmap, left_out = debrief.finish(draft)
    except debrief.NothingExplained as e:
        raise HTTPException(409, str(e)) from None
    (_session_dir(request, session_id) / WORKMAP_FILE).write_text(
        workmap.model_dump_json(indent=2), encoding="utf-8"
    )
    return FinishedDebrief(workmap=workmap, left_out=left_out)


class DebriefAnswer(BaseModel):
    gap_id: str
    text: str | None = None  # the expert's words, verbatim
    ts_ms: int | None = Field(None, ge=0)  # session clock when they said it
    speaker: str = "expert"
    declined: bool = False  # the expert would rather not answer this one

    @model_validator(mode="after")
    def _answer_or_decline(self) -> "DebriefAnswer":
        if not self.declined and (not (self.text or "").strip() or self.ts_ms is None):
            raise ValueError("an answer needs text and ts_ms, or declined: true")
        return self


def _remember(request: Request, session_id: str, draft: DraftWorkMap, gap: Gap) -> None:
    """Debrief answers go to the knowledge graph too (T-110), tagged by the step's events."""
    step = draft.step_for(gap)
    if step is None or gap.answer is None:
        return
    events = request.app.state.store.events(session_id)
    mine = [e for e in events if e.get("id") in step.event_ids]
    if not mine:
        return
    nodes = sorted({n for e in mine for n in nodes_for_event(e, events)})
    quote = {
        "text": gap.answer.text,
        "expert": gap.answer.speaker,
        "session_id": session_id,
        "date": date.today().isoformat(),
        "event_id": mine[0]["id"],
        "frame_ref": step.frame_ref,
    }
    request.app.state.knowledge.add(nodes, gap.question, quote)


# async with no await inside: answers to one draft are applied one at a time on the event loop
@router.post("/sessions/{session_id}/debrief/answer")
async def answer_gap(session_id: str, body: DebriefAnswer, request: Request) -> DraftWorkMap:
    """Close one gap: the expert's answer fills the missing reason, or they decline it."""
    draft = _load_draft(request, session_id)
    try:
        if body.declined:
            draft.decline(body.gap_id)
        else:
            quote = Quote(text=body.text, speaker=body.speaker, ts_ms=body.ts_ms, source="debrief")
            gap = draft.answer(body.gap_id, quote)
    except KeyError:
        raise HTTPException(404, "unknown gap") from None
    except GapClosed as e:
        raise HTTPException(409, str(e)) from None
    _save_draft(request, session_id, draft)
    if not body.declined:
        _remember(request, session_id, draft, gap)
    return draft
