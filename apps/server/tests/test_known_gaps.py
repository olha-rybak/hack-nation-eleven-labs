from apprentice.knowledge.graph import KnowledgeGraph, nodes_for_event
from apprentice.workmap.known import LlmCover, LlmCovers, close_known_gaps
from tests.test_workmap_builder import EVENTS, build, llm_draft

# The held invoice is from Kessler, so its step's events name supplier:kessler.
OPENED = {"id": "o", "ts_ms": 60000, "kind": "open", "entity": "invoice 4472",
          "fields": {"Supplier": "Kessler"}, "frame_ref": "frames/0000060000.jpg"}  # fmt: skip
SESSION_EVENTS = [*EVENTS, OPENED]
HOLD = next(e for e in EVENTS if e["kind"] == "hold")


class Judge:
    def __init__(self, covers: list[LlmCover]):
        self.covers, self.calls = covers, []

    async def parse(self, system, user, schema):
        assert schema is LlmCovers
        self.calls.append(user)
        return LlmCovers(covers=self.covers)


def graph_with(tmp_path, session_id: str) -> tuple[KnowledgeGraph, str]:
    g = KnowledgeGraph(tmp_path / "graph.json")
    quote = {"text": "Kessler double-bills in December, so I hold it until January.",
             "expert": "Sabine", "session_id": session_id, "date": "2026-09-27"}  # fmt: skip
    fact = g.add(nodes_for_event(HOLD, SESSION_EVENTS), "Why hold it?", quote)
    return g, fact["id"]


async def close(judge, graph, draft):
    return await close_known_gaps(judge, draft, graph, SESSION_EVENTS, 10, 2000)


async def test_gap_answered_in_an_earlier_session_is_closed_with_that_quote(tmp_path):
    graph, fid = graph_with(tmp_path, "last-week")
    draft = await build(llm_draft())
    gap = next(g for g in draft.gaps if g.kind == "no_reason")
    judge = Judge([LlmCover(gap=gap.id, fact=fid)])
    assert await close(judge, graph, draft) == [gap.id]
    assert gap.id in judge.calls[0] and "double-bills" in judge.calls[0]
    assert gap.status == "answered" and gap.fact_id == fid
    reason = draft.steps[1].reason
    assert reason.source == "earlier_session" and reason.speaker == "Sabine"
    assert reason.text.startswith("Kessler double-bills") and reason.ts_ms == HOLD["ts_ms"]
    still_open = [g for g in draft.gaps if g.status == "open"]
    assert still_open and all(g.fact_id is None for g in still_open)


async def test_null_or_unoffered_facts_close_nothing(tmp_path):
    graph, fid = graph_with(tmp_path, "last-week")
    draft = await build(llm_draft())
    ids = [g.id for g in draft.gaps]
    judge = Judge([LlmCover(gap=ids[0], fact=None), LlmCover(gap=ids[1], fact="f-made-up"),
                   LlmCover(gap="gap-99", fact=fid)])  # fmt: skip
    assert await close(judge, graph, draft) == []
    assert all(g.status == "open" for g in draft.gaps)


async def test_this_sessions_own_answers_and_an_empty_graph_need_no_model_call(tmp_path):
    for graph in (graph_with(tmp_path, "s1")[0], KnowledgeGraph(tmp_path / "empty.json")):
        judge = Judge([])
        assert await close(judge, graph, await build(llm_draft())) == []
        assert judge.calls == []
