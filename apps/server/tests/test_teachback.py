import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.session.store import SessionStore
from apprentice.workmap import teachback
from apprentice.workmap.routes import router
from apprentice.workmap.schema import WorkMap

FIXTURE = Path(__file__).parent / "fixtures" / "workmap_returns.json"


def unconfirmed() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8")) | {"confirmed_at": None}


class FakeLlm:
    """Answers each schema with what the test gave it; raises if given an exception."""

    def __init__(self, **answers):
        self.answers, self.users = answers, []

    async def parse(self, system, user, schema):
        self.users.append(user)
        answer = self.answers[schema.__name__]
        if isinstance(answer, Exception):
            raise answer
        return schema.model_validate(answer)

    async def aclose(self):
        pass


def edit(ref, field, value, target="guardrail"):
    return {"target": target, "ref": ref, "field": field, "value": value}


NEW_RULE = "Any return over 300 EUR goes to a supervisor."


def test_correction_changes_the_rule_and_its_check():
    wm = WorkMap.model_validate(unconfirmed())
    new, changes = teachback.apply(wm, [
        teachback.Edit(**edit("g-supervisor-limit", "statement", NEW_RULE)),
        teachback.Edit(**edit("g-supervisor-limit", "condition", "amount > 300")),
    ])  # fmt: skip
    g = next(g for g in new.guardrails if g.id == "g-supervisor-limit")
    assert g.statement.startswith("Any return over 300") and g.check.condition == "amount > 300"
    assert [(c.field, c.before, c.after) for c in changes][1] == (
        "condition",
        "amount > 200",
        "amount > 300",
    )


def test_edits_that_point_nowhere_or_break_the_check_are_dropped():
    wm = WorkMap.model_validate(unconfirmed())
    new, changes = teachback.apply(wm, [
        teachback.Edit(**edit("g-nope", "statement", "x")),
        teachback.Edit(**edit("g-supervisor-limit", "condition", "amount >>> 300")),
        teachback.Edit(**edit("99", "decision", "x", target="step")),
        teachback.Edit(**edit("1", "statement", "x", target="step")),
    ])  # fmt: skip
    assert changes == [] and new == wm


async def test_teach_back_falls_back_to_the_map_when_the_llm_fails():
    wm = WorkMap.model_validate(unconfirmed())
    text = await teachback.compose(FakeLlm(TeachBack=RuntimeError("down")), wm)
    assert (
        text.startswith("Here is how I understand it.") and len(text.split()) <= teachback.MAX_WORDS
    )
    assert "supervisor" in text


@pytest.fixture
def client(tmp_path):
    app = FastAPI()
    app.include_router(router)
    app.state.store = store = SessionStore(tmp_path)
    store.create("s1")
    app.state.map_llm = FakeLlm(
        TeachBack={"text": "So, as I understand it, damaged in transit is a carrier claim."},
        Correction={
            "edits": [edit("g-supervisor-limit", "statement", "Over 300 EUR, a supervisor.")]
        },
    )
    return TestClient(app), store


def test_teach_back_then_correction_lands_in_the_map_until_confirmed(client):
    c, store = client
    assert c.post("/sessions/s1/workmap/teachback").status_code == 404
    path = store.session_dir("s1") / "workmap.json"
    path.write_text(json.dumps(unconfirmed()), encoding="utf-8")
    assert c.post("/sessions/s1/workmap/teachback").json()["text"].startswith("So, as I understand")
    r = c.post("/sessions/s1/workmap/correct", json={"text": "No, only over three hundred."}).json()
    assert r["changes"][0]["after"] == "Over 300 EUR, a supervisor."
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert any(g["statement"] == "Over 300 EUR, a supervisor." for g in saved["guardrails"])
    assert c.post("/sessions/s1/workmap/confirm").json()["confirmed_at"]
    assert c.post("/sessions/s1/workmap/teachback").status_code == 409
    assert c.post("/sessions/s1/workmap/correct", json={"text": "x"}).status_code == 409
