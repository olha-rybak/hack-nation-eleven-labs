import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from apprentice.main import app
from apprentice.session.store import SessionStore
from apprentice.workmap import debrief
from apprentice.workmap.builder import (
    LlmCheck,
    LlmDraft,
    LlmGap,
    LlmGuardrail,
    LlmStep,
    build_draft,
    entity_pattern,
    expert_lines,
    render_session,
)
from apprentice.workmap.draft import DraftWorkMap

EVENTS = [
    {
        "id": "a",
        "ts_ms": 4000,
        "kind": "open",
        "entity": "invoice 4471",
        "frame_ref": "frames/0000004000.jpg",
    },
    {
        "id": "b",
        "ts_ms": 21000,
        "kind": "edit",
        "entity": "invoice 4471",
        "field": "Cost center",
        "before": "4711",
        "after": "0400",
        "frame_ref": "frames/0000021000.jpg",
    },
    {
        "id": "c",
        "ts_ms": 63000,
        "kind": "hold",
        "entity": "invoice 4472",
        "frame_ref": "frames/0000063000.jpg",
    },
]
TRANSCRIPT = [
    {"speaker": "expert", "ts_ms": 15000, "text": "Okay, this one is the spindle."},
    {"speaker": "expert", "ts_ms": 23000, "text": "ASK_NOW"},
    {"speaker": "agent", "ts_ms": 24000, "text": "You moved that to capex. Why?"},
    {"speaker": "expert", "ts_ms": 26000, "text": "Equipment over five thousand is always capex."},
]


class FakeLlm:
    def __init__(self, draft: LlmDraft):
        self.draft, self.prompts = draft, []

    async def aclose(self):
        pass

    async def parse(self, system, user, schema):
        self.prompts.append(user)
        return self.draft


def llm_draft(**over) -> LlmDraft:
    base = dict(
        title="Three supplier invoices",
        steps=[
            LlmStep(
                title="Code invoice 4471",
                decision="Re-coded 4711 to 0400",
                event_ids=["E1", "E2"],
                reason_line_ids=[3],
                is_judgment_call=True,
            ),
            LlmStep(
                title="Hold invoice 4472",
                decision="Put on hold",
                event_ids=["E3"],
                reason_line_ids=[],
                is_judgment_call=True,
            ),
        ],
        guardrails=[
            LlmGuardrail(
                kind="limit",
                statement="Equipment over 5,000 is capex",
                event_id="E2",
                reason_line_ids=[3],
                check=LlmCheck(
                    trigger_kind="edit",
                    field="Cost center",
                    condition="amount > 5000 and after == '4711'",
                    severity="stop",
                ),
            ),
        ],
        gaps=[
            LlmGap(
                kind="unseen_branch",
                event_id="E3",
                question="Is that every December?",
                why_it_matters="Decides holds",
                importance=5,
            )
        ],
    )
    return LlmDraft(**(base | over))


async def build(draft: LlmDraft):
    return await build_draft(FakeLlm(draft), "s1", EVENTS, TRANSCRIPT)


def test_prompt_numbers_lines_and_drops_cue():
    lines = expert_lines(TRANSCRIPT)
    text = render_session(EVENTS, lines)
    assert "ASK_NOW" not in text
    assert "L3 [00:26] expert: Equipment over five thousand" in text
    assert "L2 [00:24] agent:" in text
    assert "E2 [00:21] edit invoice 4471 · Cost center: '4711' -> '0400'" in text


async def test_quotes_are_verbatim_and_frames_come_from_events():
    d = await build(llm_draft())
    s1 = d.steps[0]
    assert s1.reason.text == "Equipment over five thousand is always capex."
    assert s1.reason.source == "live_question"  # the agent asked right before
    assert (s1.frame_ts, s1.frame_ref) == (21000, "frames/0000021000.jpg")  # the edit, not the open
    assert s1.event_ids == ["a", "b"] and s1.guardrail_ids == ["g1"]
    g = d.guardrails[0]
    assert g.check.entity_pattern == entity_pattern("invoice 4471") and g.frame_ts == 21000


async def test_agent_lines_never_become_quotes():
    d = await build(
        llm_draft(
            steps=[
                LlmStep(
                    title="x",
                    decision="y",
                    event_ids=["E2"],
                    reason_line_ids=[2],
                    is_judgment_call=False,
                )
            ],
            guardrails=[],
            gaps=[],
        )
    )
    assert d.steps[0].reason is None


async def test_missing_reason_and_bad_condition_become_ranked_gaps():
    bad = LlmGuardrail(
        kind="exception",
        statement="Nordtec double-bills in December",
        event_id="E3",
        reason_line_ids=[1],
        check=LlmCheck(
            trigger_kind="save", field="", severity="stop", condition="len(history) > 1"
        ),
    )
    d = await build(llm_draft(guardrails=[bad]))
    assert d.guardrails[0].check is None
    kinds = [(g.kind, g.step_index) for g in d.gaps]
    assert ("no_threshold", 2) in kinds and ("no_reason", 2) in kinds
    assert d.gaps[0].importance == 5 and d.gaps[0].kind == "unseen_branch"
    assert [g.id for g in d.gaps] == [f"gap-{i}" for i in range(1, len(d.gaps) + 1)]
    assert [g.importance for g in d.gaps] == sorted((g.importance for g in d.gaps), reverse=True)


async def test_unknown_events_drop_the_step_and_unsourced_guardrails():
    d = await build(
        llm_draft(
            steps=[
                LlmStep(
                    title="ghost",
                    decision="?",
                    event_ids=["E99"],
                    reason_line_ids=[],
                    is_judgment_call=False,
                ),
                *llm_draft().steps,
            ]
        )
    )
    assert [s.title for s in d.steps] == ["Code invoice 4471", "Hold invoice 4472"]
    assert [s.index for s in d.steps] == [1, 2]
    assert len(d.guardrails) == 1  # attached by event, so the dropped step doesn't shift it
    ghost_rule = LlmGuardrail(
        kind="limit", statement="made up", event_id="E2", reason_line_ids=[], check=None
    )
    unknown = LlmGuardrail(
        kind="limit", statement="x", event_id="E99", reason_line_ids=[3], check=None
    )
    d = await build(llm_draft(guardrails=[ghost_rule, unknown]))
    assert d.guardrails == []  # no expert quote or no step: a guess, not a guardrail


async def test_to_workmap_only_once_every_reason_is_filled():
    d = await build(llm_draft())
    with pytest.raises(ValidationError):
        d.to_workmap()
    filled = d.model_copy(deep=True)
    filled.steps[1].reason = filled.steps[0].reason
    wm = filled.to_workmap()
    assert len(wm.steps) == 2 and wm.guardrails[0].check.condition.startswith("amount")


def test_route_builds_and_saves_draft(tmp_path):
    from apprentice.knowledge.graph import KnowledgeGraph

    with TestClient(app) as client:
        app.state.store = store = SessionStore(tmp_path)
        app.state.knowledge = KnowledgeGraph(tmp_path / "graph.json")
        app.state.map_llm = FakeLlm(llm_draft())
        store.create("s1")
        for e in EVENTS:
            store.append_event("s1", e)
        for line in TRANSCRIPT:
            store.append_transcript("s1", line)
        r = client.post("/sessions/s1/workmap/draft")
        assert r.status_code == 200 and r.json()["steps"][0]["reason"]["text"].startswith("Equip")
        assert client.get("/sessions/s1/workmap/draft").json()["id"] == r.json()["id"]
        assert client.get("/sessions/nope/workmap/draft").status_code == 404


@pytest.fixture
def debrief_client(tmp_path):
    """A session with a saved draft: step 2 (the hold) has no reason yet."""
    from apprentice.guardrails.live import LiveGuardrails
    from apprentice.knowledge.graph import KnowledgeGraph

    with TestClient(app) as client:
        app.state.store = store = SessionStore(tmp_path / "sessions")
        app.state.knowledge = KnowledgeGraph(tmp_path / "graph.json")
        app.state.guardrails = LiveGuardrails(store, app.state.hub, app.state.knowledge)
        app.state.map_llm = FakeLlm(llm_draft())
        store.create("s1")
        for e in EVENTS:
            store.append_event("s1", e)
        for line in TRANSCRIPT:
            store.append_transcript("s1", line)
        draft = client.post("/sessions/s1/workmap/draft").json()
        yield client, draft


def gap_of(draft: dict, kind: str) -> dict:
    return next(g for g in draft["gaps"] if g["kind"] == kind)


def test_answer_fills_the_missing_reason_and_is_saved(debrief_client):
    client, draft = debrief_client
    gap = gap_of(draft, "no_reason")
    assert gap["status"] == "open" and gap["step_index"] == 2
    words = "Anything dated December waits for the year-end release."
    r = client.post(
        "/sessions/s1/debrief/answer", json={"gap_id": gap["id"], "text": words, "ts_ms": 90000}
    )
    assert r.status_code == 200
    saved = client.get("/sessions/s1/workmap/draft").json()
    closed = next(g for g in saved["gaps"] if g["id"] == gap["id"])
    assert closed["status"] == "answered" and closed["answer"]["source"] == "debrief"
    reason = saved["steps"][1]["reason"]
    assert reason == {"text": words, "speaker": "expert", "ts_ms": 90000, "source": "debrief"}
    wm = DraftWorkMap.model_validate(saved).to_workmap()  # every step has the expert's words now
    assert gap["question"] not in wm.open_questions


def test_answer_goes_to_the_knowledge_graph(debrief_client):
    client, draft = debrief_client
    gap = gap_of(draft, "no_reason")
    client.post(
        "/sessions/s1/debrief/answer", json={"gap_id": gap["id"], "text": "Year end.", "ts_ms": 1}
    )
    [fact] = app.state.knowledge.facts()
    assert fact["question"] == gap["question"] and fact["quotes"][0]["event_id"] == "c"


def test_decline_closes_the_gap_without_a_reason(debrief_client):
    client, draft = debrief_client
    gap = gap_of(draft, "unseen_branch")
    r = client.post("/sessions/s1/debrief/answer", json={"gap_id": gap["id"], "declined": True})
    closed = next(g for g in r.json()["gaps"] if g["id"] == gap["id"])
    assert closed["status"] == "declined" and closed["answer"] is None
    assert app.state.knowledge.facts() == []


def test_answer_errors(debrief_client):
    client, draft = debrief_client
    gid = draft["gaps"][0]["id"]
    post = lambda body, sid="s1": client.post(f"/sessions/{sid}/debrief/answer", json=body)  # noqa: E731
    assert post({"gap_id": "gap-99", "text": "x", "ts_ms": 1}).status_code == 404
    assert post({"gap_id": gid, "text": "  ", "ts_ms": 1}).status_code == 422
    assert post({"gap_id": gid, "text": "...", "ts_ms": 1}).status_code == 422
    assert post({"gap_id": gid, "text": "x"}).status_code == 422  # no ts_ms
    assert post({"gap_id": gid, "text": "x", "ts_ms": -1}).status_code == 422
    assert post({"gap_id": gid, "text": "x", "ts_ms": 1}).status_code == 200
    assert post({"gap_id": gid, "text": "again", "ts_ms": 2}).status_code == 409
    app.state.store.create("s2")
    assert post({"gap_id": gid, "text": "x", "ts_ms": 1}, "s2").status_code == 404  # no draft


async def test_debrief_queue_skips_minor_gaps_and_asks_guardrails_first():
    d = await build(llm_draft())
    d.gaps.append(d.gaps[0].model_copy(update={"id": "gap-minor", "importance": 2}))
    d.gaps.append(
        d.gaps[0].model_copy(
            update={"id": "gap-rule", "kind": "no_threshold", "guardrail_id": "g1", "importance": 3}
        )
    )
    after_live_rule = debrief.status(d, asked_live=True, min_importance=3)
    assert [g.id for g in after_live_rule.queue][-1] == "gap-rule"  # rank order
    assert "gap-minor" not in [g.id for g in after_live_rule.queue]
    no_live_rule = debrief.status(d, asked_live=False, min_importance=3)
    assert no_live_rule.next.id == "gap-rule" and no_live_rule.guardrail_needed
    assert no_live_rule.left == after_live_rule.left == 3


async def test_general_guardrail_question_only_when_nothing_covers_the_rule():
    d = await build(llm_draft())
    assert not debrief.ensure_guardrail_gap(d, asked_live=True)
    assert debrief.ensure_guardrail_gap(d, asked_live=False)
    assert d.gaps[0].id == debrief.GUARDRAIL_GAP_ID
    assert not debrief.ensure_guardrail_gap(d, asked_live=False)  # added once
    assert debrief.status(d, asked_live=False, min_importance=3).next.id == "gap-guardrail"


async def test_finish_leaves_out_what_was_never_explained():
    d = await build(llm_draft())  # step 2, the hold, has no reason
    wm, left_out = debrief.finish(d)
    assert [s.title for s in wm.steps] == ["Code invoice 4471"]
    assert left_out == ["Hold invoice 4472"]
    assert wm.guardrails[0].step_index == 1 and wm.steps[0].guardrail_ids == [wm.guardrails[0].id]
    for s in d.steps:
        s.reason = None
    with pytest.raises(debrief.NothingExplained):
        debrief.finish(d)


def test_debrief_routes_end_in_a_saved_work_map(debrief_client):
    client, _ = debrief_client
    assert client.get("/sessions/s1/workmap").status_code == 404
    first = client.get("/sessions/s1/debrief").json()
    assert first["next"]["id"] == "gap-guardrail" and first["guardrail_needed"]
    client.post(
        "/sessions/s1/debrief/answer",
        json={"gap_id": "gap-guardrail", "text": "Anything over 10,000 goes to Petra.", "ts_ms": 1},
    )
    after = client.get("/sessions/s1/debrief").json()
    assert not after["guardrail_needed"] and after["left"] == first["left"] - 1
    r = client.post("/sessions/s1/debrief/finish")
    assert r.status_code == 200 and r.json()["left_out"] == ["Hold invoice 4472"]
    assert client.get("/sessions/s1/workmap").json()["id"] == r.json()["workmap"]["id"]


def test_confirming_stamps_and_freezes_the_work_map(debrief_client):
    """T-204: only a confirmed map teaches; once confirmed, a new debrief cannot overwrite it."""
    client, _ = debrief_client
    assert client.post("/sessions/s1/workmap/confirm").status_code == 404  # no map yet
    client.post(
        "/sessions/s1/debrief/answer",
        json={"gap_id": "gap-guardrail", "text": "Anything over 10,000 goes to Petra.", "ts_ms": 1},
    )
    assert client.post("/sessions/s1/debrief/finish").json()["workmap"]["confirmed_at"] is None
    stamp = client.post("/sessions/s1/workmap/confirm").json()["confirmed_at"]
    assert stamp and client.get("/sessions/s1/workmap").json()["confirmed_at"] == stamp
    assert client.post("/sessions/s1/workmap/confirm").json()["confirmed_at"] == stamp
    assert client.post("/sessions/s1/debrief/finish").status_code == 409
    tutor = client.post("/sessions", json={"role": "tutor", "work_map_id": "s1"})
    assert tutor.status_code == 200  # the tutor accepts the confirmed map
