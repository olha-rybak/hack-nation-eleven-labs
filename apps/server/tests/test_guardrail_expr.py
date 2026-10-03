import pytest

from apprentice.guardrails.expr import ConditionError, evaluate, parse


@pytest.mark.parametrize(
    "cond, env, expected",
    [
        ("amount > 5000 and after == '4711'", {"amount": 7200, "after": "4711"}, True),
        ("amount > 5000 and after == '4711'", {"amount": 4200, "after": "4711"}, False),
        # vision reads the labelled dropdown value; code still matches
        ("after == '4711'", {"after": "4711 - Opex general"}, True),
        ("after == '4711'", {"after": "47110"}, False),
        ("supplier == 'nordtec gmbh'", {"supplier": "  Nordtec  GmbH "}, True),
        ("amount > 5000", {"amount": "7,200.00"}, True),
        ("cost_center == '0400' and not asset_number", {"cost_center": "0400"}, True),
        ("cost_center == '0400' and not asset_number", {"cost_center": "0400",
                                                         "asset_number": "AS-1"}, False),
        ("country in ('CZ', 'SK')", {"country": "cz"}, True),
        ("country not in ['CZ']", {"country": "DE"}, True),
        ("month == 12 or is_new_supplier", {"month": 11, "is_new_supplier": True}, True),
        ("1000 < amount <= 10000", {"amount": 9400}, True),
        ("amount > -1", {"amount": 0}, True),
    ],
)  # fmt: skip
def test_evaluate(cond, env, expected):
    assert evaluate(cond, env) is expected


@pytest.mark.parametrize(
    "cond, env",
    [
        ("amount > 5000", {}),  # unknown amount must never trigger
        ("amount > 5000", {"amount": "n/a"}),
        ("not (amount < 5000)", {"amount": None}) ,
    ],
)  # fmt: skip
def test_missing_facts_are_safe(cond, env):
    # ordering against None is False; negating it is the condition author's choice, document both
    result = evaluate(cond, env)
    assert result is (cond.startswith("not"))


@pytest.mark.parametrize(
    "cond",
    [
        "__import__('os').system('calc')",
        "amount.__class__",
        "open('x')",
        "[x for x in ()]",
        "lambda: 1",
        "amount if amount else 0",
        "unknown_var > 1",
        "amount + 1 > 2",
        "amount > 5000; x",
        "(amount := 1)",
        "a" * 600,
        "amount >",
        "f'{amount}' == '1'",
        "amount is None",
        "amount in (after,)",
    ],
)
def test_rejected(cond):
    with pytest.raises(ConditionError):
        parse(cond)
