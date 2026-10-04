"""Debrief gaps an earlier session already answered (T-203 step 3, T-110).

When the draft is built, each open gap is looked up in the knowledge graph by the nodes its step's
events name. Only facts with a quote from another session count; this session's answers are already
in the transcript the builder read. One model call judges which candidate fact, if any, answers each
gap; that is its only job. A covered gap is closed with the earlier quote, verbatim, and not asked.
"""

import logging

from pydantic import BaseModel

from apprentice import prompts
from apprentice.knowledge.graph import KnowledgeGraph, nodes_for_event
from apprentice.llm.structured import StructuredLlm
from apprentice.workmap.draft import DraftWorkMap
from apprentice.workmap.schema import Quote

log = logging.getLogger(__name__)


class LlmCover(BaseModel):
    gap: str  # gap id as shown, e.g. "gap-2"
    fact: str | None  # fact id that fully answers it, or null


class LlmCovers(BaseModel):
    covers: list[LlmCover]


def _earlier_quote(fact: dict, session_id: str) -> dict | None:
    return next((q for q in reversed(fact["quotes"]) if q.get("session_id") != session_id), None)


def candidates(
    draft: DraftWorkMap, graph: KnowledgeGraph, events: list[dict], max_facts: int, max_chars: int
) -> dict[str, list[dict]]:
    """Open gap id -> facts from earlier sessions about the same things on screen."""
    out: dict[str, list[dict]] = {}
    for gap in draft.gaps:
        step = draft.step_for(gap)
        if gap.status != "open" or step is None:
            continue
        mine = [e for e in events if e.get("id") in step.event_ids]
        nodes = sorted({n for e in mine for n in nodes_for_event(e, events)})
        if not nodes:
            continue
        facts = [graph.get(k["id"]) for k in graph.known(nodes, max_facts, max_chars)]
        earlier = [f for f in facts if f and _earlier_quote(f, draft.session_id)]
        if earlier:
            out[gap.id] = earlier
    return out


def render(draft: DraftWorkMap, cands: dict[str, list[dict]]) -> str:
    blocks = []
    for gap in draft.gaps:
        if gap.id not in cands:
            continue
        lines = [f"{gap.id}: {gap.question}"]
        for f in cands[gap.id]:
            q = _earlier_quote(f, draft.session_id)
            lines.append(f'  {f["id"]}: asked "{f["question"]}", answered "{q["text"]}"')
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


async def close_known_gaps(
    llm: StructuredLlm,
    draft: DraftWorkMap,
    graph: KnowledgeGraph,
    events: list[dict],
    max_facts: int,
    max_chars: int,
) -> list[str]:
    """Close the gaps earlier sessions answered; return their ids. No candidates, no call."""
    cands = candidates(draft, graph, events, max_facts, max_chars)
    if not cands:
        return []
    raw = await llm.parse(prompts.load("debrief/known"), render(draft, cands), LlmCovers)
    closed = []
    for c in raw.covers:
        fact = next((f for f in cands.get(c.gap, []) if f["id"] == c.fact), None)
        if fact is None:
            continue  # null, or a fact we did not offer for this gap
        gap = next(g for g in draft.gaps if g.id == c.gap)
        if gap.status != "open":
            continue
        q = _earlier_quote(fact, draft.session_id)
        step = draft.step_for(gap)
        quote = Quote(
            text=q["text"],
            speaker=q.get("expert") or "expert",
            ts_ms=step.frame_ts,  # the moment in this session it is about
            source="earlier_session",
        )
        draft.answer(gap.id, quote)
        gap.fact_id = fact["id"]
        log.info(
            "gap %s answered in session %s (fact %s): %r",
            gap.id, q.get("session_id"), fact["id"], gap.question,
        )  # fmt: skip
        closed.append(gap.id)
    return closed
