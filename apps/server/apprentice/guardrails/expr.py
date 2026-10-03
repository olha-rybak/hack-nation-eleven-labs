"""Restricted expression evaluator for GuardrailCheck.condition (T-300).

Conditions are written by an LLM, so they are never passed to eval/compile. They are parsed with
`ast`, checked against a whitelist, and evaluated by walking the tree here.

Grammar: and / or / not, comparisons (== != < <= > >= in, not in), parentheses, string/number/
bool/None literals, tuples/lists of literals, and the variable names in VARIABLES.

Semantics chosen for screen-read values:
- Unknown facts are None. Any ordering comparison involving None is False, and `x == None` is
  only true for None — so a missing fact can never trigger a stop by accident.
- String equality is case- and whitespace-insensitive and matches a code against its labelled
  form: '4711' == '4711 - Opex general' is True (what the vision model reads off a dropdown).
"""

import ast
import operator
import re
from typing import Any

VARIABLES = frozenset(
    {
        "amount", "after", "before", "field", "supplier", "cost_center", "asset_number",
        "month", "country", "second_approval", "is_new_supplier",
    }
)  # fmt: skip


class ConditionError(ValueError):
    """The condition is not in the allowed language."""


_ORDER = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
_LABEL_SEP = re.compile(r"^[\s\-–—:(/|]")


def _norm(s: str) -> str:
    return " ".join(s.split()).casefold()


def _eq(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, str) and isinstance(b, str):
        a, b = _norm(a), _norm(b)
        if a == b:
            return True
        short, long = sorted((a, b), key=len)
        return bool(short) and long.startswith(short) and bool(_LABEL_SEP.match(long[len(short) :]))
    if isinstance(a, str) != isinstance(b, str):
        a, b = _num(a), _num(b)
        if a is None or b is None:
            return False
    return a == b


def _num(v: Any) -> float | None:
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, int | float):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


def _order(op: ast.cmpop, a: Any, b: Any) -> bool:
    if isinstance(a, str) and isinstance(b, str):
        return _ORDER[type(op)](_norm(a), _norm(b))
    a, b = _num(a), _num(b)
    if a is None or b is None:
        return False
    return _ORDER[type(op)](a, b)


def _contains(item: Any, coll: Any) -> bool:
    if coll is None:
        return False
    if isinstance(coll, str):
        return isinstance(item, str) and _norm(item) in _norm(coll)
    return any(_eq(item, c) for c in coll)


def _check(node: ast.AST) -> None:
    match node:
        case ast.Expression(body=b):
            _check(b)
        case ast.BoolOp(op=ast.And() | ast.Or(), values=vs):
            for v in vs:
                _check(v)
        case ast.UnaryOp(op=ast.Not() | ast.USub(), operand=o):
            _check(o)
        case ast.Compare(left=left, ops=ops, comparators=cs):
            allowed = (*_ORDER, ast.Eq, ast.NotEq, ast.In, ast.NotIn)
            if not all(isinstance(op, allowed) for op in ops):
                raise ConditionError("unsupported comparison operator")
            for n in (left, *cs):
                _check(n)
        case ast.Name(id=name, ctx=ast.Load()):
            if name not in VARIABLES:
                raise ConditionError(f"unknown variable {name!r}")
        case ast.Constant(value=v):
            if not isinstance(v, str | int | float | bool | type(None)):
                raise ConditionError(f"unsupported literal {v!r}")
        case ast.Tuple(elts=es) | ast.List(elts=es):
            for e in es:
                if not isinstance(e, ast.Constant):
                    raise ConditionError("collections may only contain literals")
                _check(e)
        case _:
            raise ConditionError(f"not allowed: {type(node).__name__}")


def parse(condition: str) -> ast.Expression:
    """Parse and validate. Raises ConditionError for anything outside the language."""
    if len(condition) > 500:
        raise ConditionError("condition too long")
    try:
        tree = ast.parse(condition, mode="eval")
    except SyntaxError as e:
        raise ConditionError(f"syntax error: {e.msg}") from None
    _check(tree)
    return tree


def _eval(node: ast.AST, env: dict[str, Any]) -> Any:
    match node:
        case ast.Expression(body=b):
            return _eval(b, env)
        case ast.BoolOp(op=ast.And(), values=vs):
            return all(_truthy(_eval(v, env)) for v in vs)
        case ast.BoolOp(op=ast.Or(), values=vs):
            return any(_truthy(_eval(v, env)) for v in vs)
        case ast.UnaryOp(op=ast.Not(), operand=o):
            return not _truthy(_eval(o, env))
        case ast.UnaryOp(op=ast.USub(), operand=o):
            n = _num(_eval(o, env))
            return None if n is None else -n
        case ast.Compare(left=left, ops=ops, comparators=cs):
            a = _eval(left, env)
            for op, c in zip(ops, cs, strict=True):
                b = _eval(c, env)
                match op:
                    case ast.Eq():
                        ok = _eq(a, b)
                    case ast.NotEq():
                        ok = not _eq(a, b)
                    case ast.In():
                        ok = _contains(a, b)
                    case ast.NotIn():
                        ok = not _contains(a, b)
                    case _:
                        ok = _order(op, a, b)
                if not ok:
                    return False
                a = b
            return True
        case ast.Name(id=name):
            return env.get(name)
        case ast.Constant(value=v):
            return v
        case ast.Tuple(elts=es) | ast.List(elts=es):
            return [_eval(e, env) for e in es]
    raise ConditionError(f"not allowed: {type(node).__name__}")  # unreachable after parse()


def _truthy(v: Any) -> bool:
    if isinstance(v, str):
        return _norm(v) not in {"", "no", "false", "none", "n/a", "-"}
    return bool(v)


def evaluate(condition: str | ast.Expression, env: dict[str, Any]) -> bool:
    tree = parse(condition) if isinstance(condition, str) else condition
    return _truthy(_eval(tree, env))
