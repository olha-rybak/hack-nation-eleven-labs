from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator

from apprentice.knowledge.graph import KnowledgeGraph, nodes_for_event
from apprentice.knowledge.rules import write_rules
from apprentice.llm.structured import StructuredLlmError
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


@router.get("/knowledge/review")
async def rules_to_review(request: Request, graph: KnowledgeGraph = Depends(get_graph)) -> dict:
    """Facts the expert has not agreed to yet, each with its rule as one plain sentence."""
    try:
        await write_rules(request.app.state.map_llm, graph)
    except StructuredLlmError as e:
        raise HTTPException(502, f"could not write the rules: {e}") from None
    return {"facts": graph.unreviewed()}


class AgreeBody(BaseModel):
    rule: str | None = None  # the expert's rewrite; none means they agree as written

    @field_validator("rule")
    @classmethod
    def _not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("an edited rule needs words")
        return v and v.strip()


@router.post("/knowledge/facts/{fact_id}/agree")
async def agree(fact_id: str, body: AgreeBody, graph: KnowledgeGraph = Depends(get_graph)) -> dict:
    try:
        return graph.agree(fact_id, body.rule, datetime.now().astimezone().isoformat())
    except KeyError:
        raise HTTPException(404, "unknown fact") from None


@router.delete("/knowledge/facts/{fact_id}", status_code=204)
async def delete_fact(fact_id: str, graph: KnowledgeGraph = Depends(get_graph)) -> None:
    try:
        graph.delete(fact_id)
    except KeyError:
        raise HTTPException(404, "unknown fact") from None
