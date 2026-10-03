import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from apprentice.workmap.schema import WorkMap

FIXTURE = Path(__file__).parent / "fixtures" / "workmap_invoices.json"


@pytest.fixture
def raw() -> dict:
    return json.loads(FIXTURE.read_text())


def test_fixture_has_the_shape_the_brief_describes(raw):
    wm = WorkMap.model_validate(raw)
    assert len(wm.steps) == 7
    assert len(wm.judgment_calls) == 3
    assert len(wm.guardrails) == 4


def test_round_trips_through_json(raw):
    wm = WorkMap.model_validate(raw)
    again = WorkMap.model_validate_json(wm.model_dump_json())
    assert again == wm


def test_missing_quote_names_the_step(raw):
    bad = copy.deepcopy(raw)
    del bad["steps"][1]["reason"]
    with pytest.raises(
        ValidationError,
        match=r"step 2 \('Code the invoice to a cost center'\) is invalid: reason: Field required",
    ):
        WorkMap.model_validate(bad)


def test_blank_quote_text_names_the_step(raw):
    bad = copy.deepcopy(raw)
    bad["steps"][4]["reason"]["text"] = "   "
    with pytest.raises(
        ValidationError, match=r"step 5 .* reason\.text: .*must not be empty"
    ):
        WorkMap.model_validate(bad)


def test_quote_text_is_kept_verbatim(raw):
    raw["steps"][0]["reason"]["text"] = "  Not a repair.  "
    wm = WorkMap.model_validate(raw)
    assert wm.steps[0].reason.text == "  Not a repair.  "


def test_guardrail_without_quote_names_the_guardrail(raw):
    bad = copy.deepcopy(raw)
    del bad["guardrails"][2]["reason"]
    with pytest.raises(
        ValidationError, match=r"guardrail g3 .* is invalid: reason: Field required"
    ):
        WorkMap.model_validate(bad)


def test_guardrail_without_screen_moment_fails(raw):
    bad = copy.deepcopy(raw)
    del bad["guardrails"][0]["frame_ts"]
    with pytest.raises(
        ValidationError, match=r"guardrail g1 .* frame_ts: Field required"
    ):
        WorkMap.model_validate(bad)


def test_negative_frame_ts_fails(raw):
    bad = copy.deepcopy(raw)
    bad["steps"][0]["frame_ts"] = -1
    with pytest.raises(ValidationError, match=r"step 1 .* frame_ts"):
        WorkMap.model_validate(bad)


def test_unknown_guardrail_reference_fails(raw):
    bad = copy.deepcopy(raw)
    bad["steps"][2]["guardrail_ids"] = ["g9"]
    with pytest.raises(ValidationError, match=r"step 3 .* unknown guardrails \['g9'\]"):
        WorkMap.model_validate(bad)


def test_guardrail_pointing_at_missing_step_fails(raw):
    bad = copy.deepcopy(raw)
    bad["guardrails"][3]["step_index"] = 12
    with pytest.raises(ValidationError, match=r"guardrail g4 .* unknown step 12"):
        WorkMap.model_validate(bad)


def test_duplicate_step_index_fails(raw):
    bad = copy.deepcopy(raw)
    bad["steps"][1]["index"] = 1
    with pytest.raises(ValidationError, match="step indexes must be unique"):
        WorkMap.model_validate(bad)


def test_unknown_field_is_rejected(raw):
    bad = copy.deepcopy(raw)
    bad["steps"][0]["confidence"] = 0.9
    with pytest.raises(
        ValidationError, match=r"step 1 .* confidence: Extra inputs are not permitted"
    ):
        WorkMap.model_validate(bad)


def test_map_without_steps_fails(raw):
    bad = copy.deepcopy(raw)
    bad["steps"] = []
    bad["guardrails"] = []
    with pytest.raises(ValidationError, match="steps"):
        WorkMap.model_validate(bad)
