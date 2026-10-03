import pytest

from apprentice.session.store import SessionStore


def test_events_fold_by_id(tmp_path):
    s = SessionStore(tmp_path)
    sid = s.create()
    s.append_event(sid, {"id": "a", "v": 1})
    s.append_event(sid, {"id": "b", "v": 1})
    s.append_event(sid, {"id": "a", "v": 2})
    assert s.events(sid) == [{"id": "a", "v": 2}, {"id": "b", "v": 1}]


def test_restart_durability(tmp_path):
    s = SessionStore(tmp_path)
    sid = s.create("abc")
    s.append_event(sid, {"id": "a"})
    s.append_transcript(sid, {"speaker": "x", "ts_ms": 1, "text": "hi"})
    s2 = SessionStore(tmp_path)
    assert s2.exists("abc")
    assert s2.events("abc") == [{"id": "a"}]
    assert s2.transcript("abc")[0]["text"] == "hi"
    assert s2.meta("abc")["role"] == "interviewer"


def test_truncated_last_line_skipped(tmp_path):
    s = SessionStore(tmp_path)
    sid = s.create()
    s.append_event(sid, {"id": "a"})
    with open(tmp_path / sid / "events.jsonl", "a", encoding="utf-8") as f:
        f.write('{"id": "b", "tru')
    assert s.events(sid) == [{"id": "a"}]


def test_invalid_id_and_frame_path(tmp_path):
    s = SessionStore(tmp_path)
    with pytest.raises(ValueError):
        s.create("../evil")
    with pytest.raises(KeyError):
        s.meta("nope")
    sid = s.create()
    with pytest.raises(ValueError):
        s.frame_path(sid, "../x")


def test_frames_jsonl(tmp_path):
    s = SessionStore(tmp_path)
    sid = s.create()
    ref = s.save_frame(sid, 12000, b"jpg")
    s.record_tick(sid, 13000)
    assert ref == "frames/0000012000.jpg"
    assert s.frame_path(sid, ref).read_bytes() == b"jpg"
    assert s.frames(sid) == [
        {"ts_ms": 12000, "frame_ref": ref},
        {"ts_ms": 13000, "frame_ref": None},
    ]
