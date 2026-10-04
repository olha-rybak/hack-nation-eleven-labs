import random

from apprentice.capture.pause import (
    PauseConfig,
    PauseDetector,
    PauseService,
    Subject,
    pick_latest_subject,
)
from apprentice.session.hub import Hub
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

CFG = PauseConfig(screen_still_sec=4, silence_sec=2, cooldown_sec=60, max_questions=5)
SUBJ = Subject("e1", "invoice 4471: Cost center changed from '4711' to '0400'")


def quiet_detector(t0=0.0) -> PauseDetector:
    return PauseDetector(CFG, started_at=t0)


def test_fires_when_all_conditions_hold():
    d = quiet_detector()
    assert d.check(3.9, SUBJ).blocked_by == ("screen_still",)
    dec = d.check(4.0, SUBJ)
    assert dec.fire and dec.subject == SUBJ


def test_typing_blocks():
    d = quiet_detector()
    for t in range(10, 20):  # a frame change every second while typing
        d.on_screen_change(t)
        assert not d.check(t + 0.5, SUBJ).fire
    assert not d.check(22.9, SUBJ).fire
    assert d.check(23.0, SUBJ).fire  # 4 s after the last keystroke frame


def test_speaking_blocks_and_silence_window_counts_from_utterance_end():
    d = quiet_detector()
    d.on_user_speech(5, True)
    assert d.check(30, SUBJ).blocked_by == ("silent",)  # mid-sentence, however long
    d.on_user_speech(31, False)
    assert not d.check(32.9, SUBJ).fire
    assert d.check(33.0, SUBJ).fire


def test_agent_speaking_blocks():
    d = quiet_detector()
    d.on_agent_speech(True)
    assert d.check(10, SUBJ).blocked_by == ("agent_quiet",)


def test_cooldown():
    d = quiet_detector()
    assert d.check(10, SUBJ).fire
    d.mark_asked(10, SUBJ)
    assert d.check(69.9, SUBJ).blocked_by == ("cooldown",)
    assert d.check(70, SUBJ).fire


def test_budget():
    d = quiet_detector()
    for i in range(5):
        d.mark_asked(i * 100, Subject(f"e{i}", "x"))
    assert d.check(1000, SUBJ).blocked_by == ("budget",)


def test_nothing_to_ask_blocks():
    assert quiet_detector().check(100, None).blocked_by == ("subject",)


def test_subject_picker_prefers_unasked_decisions():
    events = [
        {"id": "a", "kind": "edit", "entity": "invoice 4471", "field": "Cost center",
         "before": "4711", "after": "0400"},
        {"id": "b", "kind": "open", "entity": "invoice 4472"},
        {"id": "c", "kind": "navigate", "entity": "invoice list"},
    ]  # fmt: skip
    assert pick_latest_subject(events, set()).event_id == "a"  # edit beats a later open
    assert pick_latest_subject(events, {"a"}).event_id == "b"
    assert pick_latest_subject(events, {"a", "b"}) is None  # navigate is never a subject
    assert "'4711' to '0400'" in pick_latest_subject(events, set()).text


GUARDED_EVENTS = [
    {"id": "a", "kind": "edit", "entity": "invoice 4471", "field": "Cost center",
     "before": "4711", "after": "0400"},
    {"id": "h", "kind": "hold", "entity": "invoice 4473"},
    {"id": "b", "kind": "edit", "entity": "invoice 4472", "field": "Amount",
     "before": "100", "after": "120"},
    {"id": "o", "kind": "open", "entity": "invoice 4474"},
]  # fmt: skip


def test_hold_or_route_is_a_guardrail_subject():
    assert pick_latest_subject(GUARDED_EVENTS, {"a", "b"}).guardrail  # the hold
    assert not pick_latest_subject(GUARDED_EVENTS, set()).guardrail  # latest edit, not a guardrail


def test_forced_guardrail_prefers_a_hold_then_any_decision():
    assert pick_latest_subject(GUARDED_EVENTS, set(), guardrail=True).event_id == "h"
    s = pick_latest_subject(GUARDED_EVENTS, {"h"}, guardrail=True)
    assert s.event_id == "b" and s.guardrail  # no hold left: an edit, asked as a guardrail
    # an open is never forced into a guardrail question
    assert pick_latest_subject(GUARDED_EVENTS, {"h", "a", "b"}, guardrail=True) is None


def test_guardrail_forced_by_fourth_question_unless_asked():
    d = quiet_detector()
    for i in range(3):
        assert not d.needs_guardrail()
        d.mark_asked(i * 100, Subject(f"e{i}", "x"))
    assert d.needs_guardrail()  # question 4 must be the guardrail one
    d.mark_asked(300, Subject("g", "x", guardrail=True))
    assert d.guardrail_asked and not d.needs_guardrail()

    early = quiet_detector()
    early.mark_asked(0, Subject("h", "x", guardrail=True))
    early.mark_asked(100, Subject("e1", "x"))
    early.mark_asked(200, Subject("e2", "x"))
    assert not early.needs_guardrail()


def test_guardrail_forced_on_last_question_when_budget_is_small():
    d = PauseDetector(PauseConfig(4, 2, 60, max_questions=2, guardrail_by=4), started_at=0)
    d.mark_asked(0, Subject("e0", "x"))
    assert d.needs_guardrail()


def test_restore_rebuilds_session_state_from_pause_log():
    d = quiet_detector()
    d.restore([
        {"t": 1, "blocked_by": ["screen_still"], "near_miss": True},
        {"t": 5, "ask_now": {"event_id": "a", "guardrail": False}},
        {"t": 90, "ask_now": {"event_id": "h", "guardrail": True}},
    ])  # fmt: skip
    assert d.asked == 2 and d.asked_event_ids == {"a", "h"} and d.guardrail_asked


def test_simulated_ten_minutes_never_interrupts_activity():
    """Acceptance shape: zero asks while typing/speaking, >= 3 asks in 10 minutes."""
    rng = random.Random(7)
    d = quiet_detector()
    busy: list[tuple[float, float]] = []  # intervals where the expert is typing or talking
    t, fired = 0.0, []
    events_since_ask = 0
    while t < 600:
        # work burst: typing (frame changes) for 5-25 s, sometimes narrating over it
        burst = rng.uniform(5, 25)
        talking = rng.random() < 0.5
        if talking:
            d.on_user_speech(t, True)
        end = t + burst
        while t < end:
            d.on_screen_change(t)
            assert not d.check(t, SUBJ).fire
            t += 0.25
        if talking:
            d.on_user_speech(t, False)
        busy.append((end - burst, t))
        events_since_ask += 1
        # pause: 2-15 s of nothing
        pause_end = t + rng.uniform(2, 15)
        while t < pause_end:
            dec = d.check(t, SUBJ if events_since_ask else None)
            if dec.fire:
                d.mark_asked(t, SUBJ)
                fired.append(t)
                events_since_ask = 0
            t += 0.25
    assert not any(a <= f <= b for f in fired for a, b in busy)
    assert 3 <= len(fired) <= CFG.max_questions


async def test_service_publishes_ask_now_and_logs(tmp_path):
    store = SessionStore(tmp_path)
    store.create("s1")
    store.append_event(
        "s1",
        {"id": "e1", "kind": "edit", "entity": "invoice 4471", "field": "Cost center",
         "before": "4711", "after": "0400"},
    )  # fmt: skip
    hub = Hub()
    sent = []

    async def capture(sid, type, data):
        sent.append((sid, type, data))

    hub.publish = capture
    now = [0.0]
    svc = PauseService(store, hub, Settings(), clock=lambda: now[0])
    svc.detector("s1")  # starts the ticker task; we drive tick() by hand instead
    svc._tasks["s1"].cancel()

    now[0] = 1.0
    assert not (await svc.tick("s1")).fire
    now[0] = 10.0
    assert (await svc.tick("s1")).fire
    now[0] = 11.0
    await svc.tick("s1")  # cooldown now blocks

    [(sid, type, data)] = sent
    assert (sid, type) == ("s1", "ask_now")
    assert data["event_id"] == "e1" and data["question_index"] == 1
    log = store.pause_log("s1")
    assert log[0]["blocked_by"] == ["screen_still"] and log[0]["near_miss"] is True
    assert any("ask_now" in e for e in log)
    assert log[-1]["blocked_by"] == ["cooldown", "subject"]
    svc.stop_all()


async def test_service_forces_guardrail_and_survives_restart(tmp_path):
    store = SessionStore(tmp_path)
    store.create("s1")
    for e in GUARDED_EVENTS:
        store.append_event("s1", e)
    sent = []

    async def capture(sid, type, data):
        sent.append(data)

    hub = Hub()
    hub.publish = capture
    now = [0.0]
    settings = Settings(GUARDRAIL_BY_QUESTION=2, ASK_COOLDOWN_SEC=0)

    def service() -> PauseService:
        svc = PauseService(store, hub, settings, clock=lambda: now[0])
        svc.detector("s1")
        svc._tasks["s1"].cancel()
        return svc

    svc = service()
    now[0] = 10.0
    assert (await svc.tick("s1")).fire
    svc.stop_all()

    svc = service()  # a restart: the first question is remembered from the pause log
    assert svc.detectors["s1"].asked == 1
    now[0] = 20.0
    assert (await svc.tick("s1")).fire
    svc.stop_all()

    first, second = sent
    assert first["event_id"] == "b" and not first["guardrail"]
    assert second["event_id"] == "h" and second["guardrail"] and second["question_index"] == 2
