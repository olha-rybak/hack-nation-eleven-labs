"""T-110 through the running app: answers become facts, facts come back as Known with ask_now.

The app starts from its real lifespan with data dirs in tmp and pause thresholds at zero, so the
pause ticker fires ask_now as soon as there is something to ask.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from apprentice.knowledge.rules import LlmRule, LlmRules
from apprentice.llm.structured import StructuredLlmError
from apprentice.main import app
from apprentice.settings import get_settings

KESSLER_FIELDS = {"Supplier": "Kessler", "Amount": "6,200.00 EUR"}


def open_invoice(eid: str, number: str, fields: dict, ts_ms: int = 1000) -> dict:
    return {"id": eid, "ts_ms": ts_ms, "kind": "open", "entity": f"invoice {number}",
            "confidence": 0.95, "frame_ref": f"frames/{ts_ms:010d}.jpg",
            "fields": fields}  # fmt: skip


def edit(eid: str, number: str, field: str, before: str, after: str, ts_ms: int = 2000) -> dict:
    return {"id": eid, "ts_ms": ts_ms, "kind": "edit", "entity": f"invoice {number}",
            "field": field, "before": before, "after": after, "confidence": 0.9,
            "frame_ref": f"frames/{ts_ms:010d}.jpg"}  # fmt: skip


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("KNOWLEDGE_PATH", str(tmp_path / "knowledge" / "graph.json"))
    for name in ("PAUSE_SCREEN_STILL_SEC", "PAUSE_SILENCE_SEC", "ASK_COOLDOWN_SEC"):
        monkeypatch.setenv(name, "0")
    monkeypatch.setenv("PAUSE_TICK_SEC", "0.01")
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


@pytest.fixture
def api(env):
    with TestClient(app) as client:
        yield client


def answer(api, session_id: str, event_id: str, text: str, question: str = "Why?") -> dict:
    body = {"session_id": session_id, "event_id": event_id, "question": question,
            "answer": text, "expert": "Anna"}  # fmt: skip
    r = api.post("/knowledge/answers", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_answer_becomes_a_fact_tagged_with_what_was_on_screen(api):
    api.post("/sessions", json={"session_id": "s1"})
    api.post("/events?session=s1", json=[
        open_invoice("o1", "4471", KESSLER_FIELDS),
        edit("e1", "4471", "Cost center", "4711", "0400"),
    ])  # fmt: skip

    answer(api, "s1", "e1", "Kessler invoices over 5,000 are capex, they go to 0400.",
           question="Why did you change the cost center to 0400?")  # fmt: skip

    [fact] = api.get("/knowledge").json()["facts"]
    assert fact["nodes"] == ["field:cost_center", "supplier:kessler", "value:0400", "value:4711"]
    assert fact["question"] == "Why did you change the cost center to 0400?"
    assert fact["quotes"] == [
        {
            "text": "Kessler invoices over 5,000 are capex, they go to 0400.",
            "expert": "Anna",
            "session_id": "s1",
            "date": date.today().isoformat(),
            "event_id": "e1",
            "frame_ref": "frames/0000002000.jpg",
        }
    ]


def test_facts_survive_a_restart(env):
    with TestClient(app) as api:
        api.post("/sessions", json={"session_id": "s1"})
        api.post("/events?session=s1", json=[
            open_invoice("o1", "4471", KESSLER_FIELDS),
            edit("e1", "4471", "Cost center", "4711", "0400"),
        ])  # fmt: skip
        fact = answer(api, "s1", "e1", "Capex goes to 0400.")
    with TestClient(app) as api:
        assert api.get("/knowledge").json()["facts"] == [fact]


def test_answer_to_unknown_session_or_event_is_rejected(api):
    body = {"session_id": "nope", "event_id": "e1", "question": "Why?", "answer": "Because."}
    assert api.post("/knowledge/answers", json=body).status_code == 404
    api.post("/sessions", json={"session_id": "s1"})
    assert api.post("/knowledge/answers", json=body | {"session_id": "s1"}).status_code == 404
    assert api.post("/knowledge/answers", json=body | {"session_id": "bad id"}).status_code == 422
    assert api.get("/knowledge").json()["facts"] == []


def ask_now_about(ws, event_id: str) -> dict:
    while True:
        msg = ws.receive_json()
        if msg["type"] == "ask_now" and msg["data"]["event_id"] == event_id:
            return msg["data"]


def logged_ask_now(session_id: str, event_id: str) -> dict:
    [entry] = [
        e["ask_now"] for e in app.state.store.pause_log(session_id)
        if "ask_now" in e and e["ask_now"]["event_id"] == event_id
    ]  # fmt: skip
    return entry


def test_ask_now_carries_what_we_already_know_about_the_subject(api):
    api.post("/sessions", json={"session_id": "s1"})
    api.post("/events?session=s1", json=[
        open_invoice("o1", "4471", KESSLER_FIELDS),
        edit("e1", "4471", "Cost center", "4711", "0400"),
    ])  # fmt: skip
    fact = answer(api, "s1", "e1", "Capex goes to 0400.", question="Why 0400?")

    api.post("/sessions", json={"session_id": "s2"})
    with api.websocket_connect("/ws/session/s2") as ws:
        api.post("/events?session=s2", json=[
            open_invoice("o2", "5102", KESSLER_FIELDS),
            edit("e2", "5102", "Cost center", "4711", "0400"),
        ])  # fmt: skip
        msg = ask_now_about(ws, "e2")

    today = date.today().isoformat()
    assert msg["known"] == [
        {"id": fact["id"], "text": f'Why 0400? "Capex goes to 0400." (Anna, {today})'}
    ]
    assert logged_ask_now("s2", "e2")["known"] == msg["known"]


def test_ask_now_with_nothing_known_sends_an_empty_slice(api):
    api.post("/sessions", json={"session_id": "s1"})
    with api.websocket_connect("/ws/session/s1") as ws:
        api.post("/events?session=s1", json=[
            open_invoice("o1", "4471", KESSLER_FIELDS),
            edit("e1", "4471", "Cost center", "4711", "0400"),
        ])  # fmt: skip
        assert ask_now_about(ws, "e1")["known"] == []


def seed_five_facts(api) -> dict[str, str]:
    """Facts from session s1, by how they relate to a Kessler cost-center edit 4711 -> 0400."""
    brandt = {"Supplier": "Brandt"}
    api.post("/sessions", json={"session_id": "s1"})
    api.post("/events?session=s1", json=[
        open_invoice("o1", "4471", KESSLER_FIELDS),
        edit("same", "4471", "Cost center", "4711", "0400"),
        edit("supplier", "4471", "Asset number", "", "A-118", ts_ms=3000),
        open_invoice("o2", "4480", brandt, ts_ms=4000),
        edit("field", "4480", "Cost center", "4711", "0300", ts_ms=5000),
        {**edit("two_hops", "4480", "Status", "open", "on hold", ts_ms=6000), "kind": "hold"},
        open_invoice("o3", "4490", {"Supplier": "Nordtec"}, ts_ms=7000),
        {**edit("unrelated", "4490", "Approver", "", "second approval", ts_ms=8000),
         "kind": "route"},
    ])  # fmt: skip
    return {
        eid: answer(api, "s1", eid, f"answer about {eid}")["id"]
        for eid in ("unrelated", "two_hops", "supplier", "field", "same")
    }


def ask_about_kessler_cost_center(api) -> dict:
    api.post("/sessions", json={"session_id": "s2"})
    with api.websocket_connect("/ws/session/s2") as ws:
        api.post("/events?session=s2", json=[
            open_invoice("o9", "5102", KESSLER_FIELDS),
            edit("e9", "5102", "Cost center", "4711", "0400"),
        ])  # fmt: skip
        return ask_now_about(ws, "e9")


def test_known_ranks_direct_matches_by_shared_nodes_then_two_hops(api):
    ids = seed_five_facts(api)
    known = [k["id"] for k in ask_about_kessler_cost_center(api)["known"]]
    assert known == [ids["same"], ids["field"], ids["supplier"], ids["two_hops"]]


def test_known_is_capped_by_fact_count(env, monkeypatch):
    monkeypatch.setenv("KNOWN_MAX_FACTS", "2")
    get_settings.cache_clear()
    with TestClient(app) as api:
        ids = seed_five_facts(api)
        known = [k["id"] for k in ask_about_kessler_cost_center(api)["known"]]
    assert known == [ids["same"], ids["field"]]


def test_known_is_capped_by_length(env, monkeypatch):
    first = f'Why? "answer about same" (Anna, {date.today().isoformat()})'
    monkeypatch.setenv("KNOWN_MAX_CHARS", str(len(first) + 10))
    get_settings.cache_clear()
    with TestClient(app) as api:
        seed_five_facts(api)
        known = ask_about_kessler_cost_center(api)["known"]
    assert [k["text"] for k in known] == [first]


def test_second_session_sees_the_first_answer_and_a_repeat_merges(api):
    """T-110 acceptance: no re-asking across sessions, and a repeated answer is one fact."""
    api.post("/sessions", json={"session_id": "s1"})
    api.post("/events?session=s1", json=[
        open_invoice("o1", "4471", KESSLER_FIELDS),
        edit("e1", "4471", "Cost center", "4711", "0400"),
    ])  # fmt: skip
    fact = answer(api, "s1", "e1", "Over 5,000 it's capex, so 0400.", question="Why 0400?")

    api.post("/sessions", json={"session_id": "s2"})
    with api.websocket_connect("/ws/session/s2") as ws:
        api.post("/events?session=s2", json=[
            open_invoice("o2", "5102", KESSLER_FIELDS),
            edit("e2", "5102", "Cost center", "4711", "0400"),
        ])  # fmt: skip
        assert [k["id"] for k in ask_now_about(ws, "e2")["known"]] == [fact["id"]]
    answer(api, "s2", "e2", "Capex, 0400, same as always.", question="Is 0400 right here too?")

    [merged] = api.get("/knowledge").json()["facts"]
    assert merged["id"] == fact["id"]
    assert merged["question"] == "Why 0400?"
    assert [(q["session_id"], q["text"]) for q in merged["quotes"]] == [
        ("s1", "Over 5,000 it's capex, so 0400."),
        ("s2", "Capex, 0400, same as always."),
    ]


# T-205: the expert goes through learned rules one by one, as plain sentences, and agrees,
# edits or deletes each.


class FakeLlm:
    """Writes "Rule for <question>" for every fact it is shown."""

    def __init__(self, fail: bool = False):
        self.fail, self.prompts = fail, []

    async def aclose(self):
        pass

    async def parse(self, system, user, schema):
        self.prompts.append(user)
        if self.fail:
            raise StructuredLlmError("stopped: refusal")
        ids = [line.split(":")[0] for line in user.split("\n") if line and not line[0].isspace()]
        return LlmRules(rules=[LlmRule(fact=i, rule=f"Rule for {i}") for i in ids])


@pytest.fixture
def review(env):
    with TestClient(app) as client:
        app.state.map_llm = llm = FakeLlm()
        yield client, llm


def two_sessions(api) -> list[dict]:
    """Three facts from two sessions: cost center, hold, and the same cost center again."""
    api.post("/sessions", json={"session_id": "s1"})
    api.post("/events?session=s1", json=[
        open_invoice("o1", "4471", KESSLER_FIELDS),
        edit("e1", "4471", "Cost center", "4711", "0400"),
        edit("e2", "4471", "Status", "open", "held", ts_ms=3000),
    ])  # fmt: skip
    capex = answer(api, "s1", "e1", "Over 5,000 it's capex, so 0400.", question="Why 0400?")
    hold = answer(api, "s1", "e2", "Kessler double-bills in December.", question="Why hold it?")
    api.post("/sessions", json={"session_id": "s2"})
    api.post("/events?session=s2", json=[
        open_invoice("o2", "8810", {"Supplier": "Nordtec"}),
        edit("e3", "8810", "Approver", "", "Second approver"),
    ])  # fmt: skip
    second = answer(api, "s2", "e3", "Czech invoices need a second approval.", question="Why?")
    return [capex, hold, second]


def test_two_sessions_agree_edit_and_delete(review):
    """T-205 acceptance: one list from both sessions; agree, edit one, delete one."""
    api, llm = review
    capex, hold, second = two_sessions(api)

    facts = api.get("/knowledge/review").json()["facts"]
    assert {f["id"]: f["rule"] for f in facts} == {
        f["id"]: f"Rule for {f['id']}" for f in (capex, hold, second)
    }
    assert {q["session_id"] for f in facts for q in f["quotes"]} == {"s1", "s2"}

    assert api.post(f"/knowledge/facts/{capex['id']}/agree", json={}).status_code == 200
    rewrite = {"rule": "  Czech invoices over 10,000 need a second approval. "}
    r = api.post(f"/knowledge/facts/{second['id']}/agree", json=rewrite)
    assert r.json()["rule"] == "Czech invoices over 10,000 need a second approval."
    assert api.delete(f"/knowledge/facts/{hold['id']}").status_code == 204

    assert api.get("/knowledge/review").json()["facts"] == []
    graph = {f["id"]: f for f in api.get("/knowledge").json()["facts"]}
    assert set(graph) == {capex["id"], second["id"]}
    assert graph[capex["id"]]["rule"] == f"Rule for {capex['id']}"
    assert graph[second["id"]]["edited"] is True
    assert all(f["agreed_at"] for f in graph.values())
    assert len(llm.prompts) == 1  # sentences are written once, not on every look


def test_new_quote_sends_an_agreed_rule_back_for_review(review):
    api, _ = review
    capex, *_ = two_sessions(api)
    api.get("/knowledge/review")
    api.post(f"/knowledge/facts/{capex['id']}/agree", json={})
    api.post("/sessions", json={"session_id": "s3"})
    api.post("/events?session=s3", json=[
        open_invoice("o3", "9001", KESSLER_FIELDS),
        edit("e9", "9001", "Cost center", "4711", "0400"),
    ])  # fmt: skip
    answer(api, "s3", "e9", "Only over 10,000 now.")
    ids = [f["id"] for f in api.get("/knowledge/review").json()["facts"]]
    assert capex["id"] in ids


def test_blank_edit_and_unknown_fact_are_rejected(review):
    api, _ = review
    capex, *_ = two_sessions(api)
    assert api.post(f"/knowledge/facts/{capex['id']}/agree", json={"rule": "  "}).status_code == 422
    assert api.post("/knowledge/facts/fnope/agree", json={}).status_code == 404
    assert api.delete("/knowledge/facts/fnope").status_code == 404


def test_failed_rule_writing_is_a_502(review):
    api, _ = review
    two_sessions(api)
    app.state.map_llm = FakeLlm(fail=True)
    assert api.get("/knowledge/review").status_code == 502
