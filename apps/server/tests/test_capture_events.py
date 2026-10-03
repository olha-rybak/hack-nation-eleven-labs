from apprentice.capture.events import Event, RawEvent, parse_model_events, to_events


def raw(**kw) -> RawEvent:
    base = {"kind": "edit", "entity": "invoice 4471", "field": "Cost center", "confidence": 0.9}
    return RawEvent.model_validate(base | kw)


def test_parse_tolerates_fences_thinking_and_bad_items():
    text = (
        "<think>the {cost center} changed</think>Sure!\n```json\n"
        '{"events": [{"kind": "edit", "entity": "invoice 4471", "field": "Cost center",'
        ' "before": 4711, "after": "0400", "confidence": 0.9},'
        ' {"kind": "teleport", "entity": "x", "confidence": 1}]}\n```'
    )
    [ev] = parse_model_events(text)
    assert ev.before == 4711 and ev.after == "0400"


def test_parse_garbage_is_empty():
    assert parse_model_events("no json here {oops") == []


def test_low_confidence_dropped():
    assert to_events([raw(after="0400", confidence=0.3)], None, 1000, "f", 0.6) == []


def test_typing_collapses_into_one_edit():
    a = to_events([raw(before="4711", after="0")], None, 1000, "f1", 0.6)
    [first] = a
    b = to_events([raw(before="0", after="04")], first, 2000, "f2", 0.6)
    [merged] = b
    assert merged.id == first.id  # same id -> store replaces the earlier line
    assert merged.before == "4711" and merged.after == "04" and merged.ts_ms == 2000


def test_merge_within_one_reply_and_repeat_dropped():
    out = to_events(
        [raw(before="4711", after="04"), raw(before="04", after="0400"), raw(after="0400")],
        None,
        1000,
        "f",
        0.6,
    )
    [ev] = out
    assert (ev.before, ev.after) == ("4711", "0400")


def test_different_field_is_new_event():
    first = Event(
        ts_ms=1, kind="edit", entity="invoice 4471", field="Cost center",
        before="4711", after="0400", confidence=0.9, frame_ref="f",
    )  # fmt: skip
    [ev] = to_events([raw(field="Asset number", before=None, after="AS-1")], first, 2, "g", 0.6)
    assert ev.id != first.id


def test_repeated_open_dropped():
    last = Event(ts_ms=1, kind="open", entity="Invoice 4471 ", confidence=0.9, frame_ref="f")
    assert to_events([raw(kind="open", entity="invoice 4471", field=None)], last, 2, "g", 0.6) == []
