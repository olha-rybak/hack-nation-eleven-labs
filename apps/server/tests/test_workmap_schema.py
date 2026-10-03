import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from apprentice.workmap import WorkMap, dump_workmap, load_workmap

FIXTURE = Path(__file__).parent / "fixtures" / "workmap_invoices.json"


def raw() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_fixture_loads_and_summary():
    wm = load_workmap(FIXTURE)
    assert wm.summary == {"steps": 7, "judgment_calls": 3, "guardrails": 4}
    assert wm.is_confirmed
    assert wm.guardrail("g-capex-limit").check.severity == "stop"
    assert "summary" in json.loads(wm.model_dump_json())


def test_round_trip(tmp_path):
    wm = load_workmap(FIXTURE)
    out = tmp_path / "wm.json"
    dump_workmap(wm, out)
    assert load_workmap(out) == wm


def test_empty_quote_names_step():
    data = raw()
    data["steps"][2]["reason"]["text"] = "   "
    with pytest.raises(ValidationError) as e:
        WorkMap.model_validate(data)
    msg = str(e.value)
    assert "step 2" in msg and "Code the invoice to a cost center" in msg
    assert "reason quote is empty" in msg


def test_empty_frame_ref_names_guardrail():
    data = raw()
    data["guardrails"][1]["frame_ref"] = ""
    with pytest.raises(ValidationError, match="g-asset-number"):
        WorkMap.model_validate(data)


def test_unknown_guardrail_id():
    data = raw()
    data["steps"][0]["guardrail_ids"] = ["g-nope"]
    with pytest.raises(ValidationError, match="g-nope"):
        WorkMap.model_validate(data)


def test_duplicate_guardrail_id():
    data = raw()
    data["guardrails"][1]["id"] = data["guardrails"][0]["id"]
    with pytest.raises(ValidationError, match="duplicate id"):
        WorkMap.model_validate(data)


def test_bad_regex():
    data = raw()
    data["guardrails"][0]["check"]["entity_pattern"] = "invoice (\\d+"
    with pytest.raises(ValidationError, match="g-capex-limit"):
        WorkMap.model_validate(data)


def test_step_index_gap():
    data = raw()
    data["steps"][3]["index"] = 9
    with pytest.raises(ValidationError, match="position 3"):
        WorkMap.model_validate(data)


def test_guardrail_step_index_dangling():
    data = raw()
    data["guardrails"][0]["step_index"] = 99
    with pytest.raises(ValidationError, match="step_index 99"):
        WorkMap.model_validate(data)


def test_steps_for():
    wm = load_workmap(FIXTURE)
    assert [s.index for s in wm.steps_for("g-nordtec-duplicate")] == [4]
    assert [s.index for s in wm.steps_for("g-capex-limit")] == [2]
