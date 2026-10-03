from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from apprentice.knowledge.graph import KnowledgeGraph, nodes_for_event
from apprentice.session.routes import _require, get_store
from apprentice.session.store import SessionStore

router = APIRouter()


def get_graph(request: Request) -> KnowledgeGraph:
    return request.app.state.knowledge


class AnswerBody(BaseModel):
    session_id: str
    event_id: str  # the event the question was about; its nodes tag the answer
    question: str
    answer: str
    expert: str = "expert"


@router.post("/knowledge/answers")
async def add_answer(
    body: AnswerBody,
    graph: KnowledgeGraph = Depends(get_graph),
    store: SessionStore = Depends(get_store),
) -> dict:
    _require(store, body.session_id)
    events = store.events(body.session_id)
    event = next((e for e in events if e["id"] == body.event_id), None)
    if event is None:
        raise HTTPException(404, "unknown event")
    quote = {
        "text": body.answer,
        "expert": body.expert,
        "session_id": body.session_id,
        "date": date.today().isoformat(),
        "event_id": body.event_id,
        "frame_ref": event.get("frame_ref"),
    }
    return graph.add(nodes_for_event(event, events), body.question, quote)


@router.get("/knowledge")
async def list_facts(graph: KnowledgeGraph = Depends(get_graph)) -> dict:
    return {"facts": graph.facts()}
