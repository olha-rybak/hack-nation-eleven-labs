from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from apprentice.main import app
from apprentice.session.store import SessionStore
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
    with TestClient(app) as client:
        app.state.store = store = SessionStore(tmp_path)
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


def test_route_serves_confirmed_workmap(tmp_path):
    fixture = Path(__file__).parent / "fixtures" / "workmap_returns.json"
    with TestClient(app) as client:
        app.state.store = store = SessionStore(tmp_path)
        store.create("s1")
        assert client.get("/sessions/s1/workmap").status_code == 404
        (store.session_dir("s1") / "workmap.json").write_bytes(fixture.read_bytes())
        r = client.get("/sessions/s1/workmap")
        assert r.status_code == 200 and len(r.json()["steps"]) == 5
