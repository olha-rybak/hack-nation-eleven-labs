"""When may the agent speak? See docs/tickets/T-104-pause-detector.md.

The agent never decides this itself. All four ticket conditions must hold, plus two guards:
there is something new to ask about, and the agent is not already talking.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from apprentice.session.hub import Hub
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

log = logging.getLogger(__name__)

# Order matters only for readability of logs.
CONDITIONS = ("screen_still", "silent", "agent_quiet", "cooldown", "budget", "subject")
# Events worth an interruption, most interesting first; open/navigate are rarely a "why".
SUBJECT_PRIORITY = {"edit": 0, "hold": 0, "route": 0, "save": 1, "unknown": 2, "open": 3}


@dataclass(frozen=True)
class PauseConfig:
    screen_still_sec: float
    silence_sec: float
    cooldown_sec: float
    max_questions: int

    @classmethod
    def from_settings(cls, s: Settings) -> "PauseConfig":
        return cls(
            s.PAUSE_SCREEN_STILL_SEC, s.PAUSE_SILENCE_SEC, s.ASK_COOLDOWN_SEC, s.MAX_LIVE_QUESTIONS
        )


@dataclass(frozen=True)
class Subject:
    event_id: str
    text: str  # one line the question writer (T-108) grounds its question in


SubjectPicker = Callable[[list[dict], set[str]], Subject | None]


def pick_latest_subject(events: list[dict], asked: set[str]) -> Subject | None:
    """Placeholder for T-108: the most recent un-asked event, decisions before navigation."""
    candidates = [
        (SUBJECT_PRIORITY[e["kind"]], -i, e)
        for i, e in enumerate(events)
        if e["id"] not in asked and e["kind"] in SUBJECT_PRIORITY
    ]
    if not candidates:
        return None
    e = min(candidates, key=lambda c: c[:2])[2]
    if e["kind"] == "edit":
        text = f"{e['entity']}: {e['field']} changed from {e['before']!r} to {e['after']!r}"
    else:
        text = f"{e['entity']}: {e['kind']}"
    return Subject(e["id"], text)


@dataclass
class Decision:
    fire: bool
    blocked_by: tuple[str, ...]
    subject: Subject | None = None


@dataclass
class PauseDetector:
    """Pure state machine. `now` is a monotonic clock in seconds, passed in for testability."""

    cfg: PauseConfig
    started_at: float
    last_screen_activity: float = field(init=False)
    user_speaking: bool = False
    last_user_speech: float = float("-inf")  # last moment the user was heard speaking
    agent_speaking: bool = False
    last_asked: float | None = None
    asked: int = 0
    asked_event_ids: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self.last_screen_activity = self.started_at

    def on_screen_change(self, now: float) -> None:
        self.last_screen_activity = now

    def on_user_speech(self, now: float, speaking: bool) -> None:
        if self.user_speaking or speaking:
            self.last_user_speech = now  # start or end of an utterance
        self.user_speaking = speaking

    def on_agent_speech(self, speaking: bool) -> None:
        self.agent_speaking = speaking

    def check(self, now: float, subject: Subject | None) -> Decision:
        c = self.cfg
        held = {
            "screen_still": now - self.last_screen_activity >= c.screen_still_sec,
            "silent": not self.user_speaking and now - self.last_user_speech >= c.silence_sec,
            "agent_quiet": not self.agent_speaking,
            "cooldown": self.last_asked is None or now - self.last_asked >= c.cooldown_sec,
            "budget": self.asked < c.max_questions,
            "subject": subject is not None,
        }
        blocked = tuple(k for k in CONDITIONS if not held[k])
        return Decision(not blocked, blocked, subject if not blocked else None)

    def mark_asked(self, now: float, subject: Subject) -> None:
        self.asked += 1
        self.last_asked = now
        self.asked_event_ids.add(subject.event_id)


class PauseService:
    """Runs one detector per session on a ticker and pushes `ask_now` over the session websocket."""

    def __init__(
        self,
        store: SessionStore,
        hub: Hub,
        settings: Settings,
        pick: SubjectPicker = pick_latest_subject,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.store, self.hub, self.pick, self.clock = store, hub, pick, clock
        self.cfg = PauseConfig.from_settings(settings)
        self.tick_sec = settings.PAUSE_TICK_SEC
        self.detectors: dict[str, PauseDetector] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._last_blocked: dict[str, tuple[str, ...]] = {}

    def detector(self, session_id: str) -> PauseDetector:
        if session_id not in self.detectors:
            self.detectors[session_id] = PauseDetector(self.cfg, self.clock())
            self._tasks[session_id] = asyncio.create_task(self._loop(session_id))
        return self.detectors[session_id]

    def stop(self, session_id: str) -> None:
        if task := self._tasks.pop(session_id, None):
            task.cancel()
        self.detectors.pop(session_id, None)
        self._last_blocked.pop(session_id, None)

    def stop_all(self) -> None:
        for sid in list(self._tasks):
            self.stop(sid)

    async def _loop(self, session_id: str) -> None:
        while True:
            try:
                await self.tick(session_id)
            except Exception:
                log.exception("pause tick failed for %s", session_id)
            await asyncio.sleep(self.tick_sec)

    async def tick(self, session_id: str) -> Decision:
        det = self.detectors[session_id]
        now = self.clock()
        subject = self.pick(self.store.events(session_id), det.asked_event_ids)
        d = det.check(now, subject)
        self._log_transition(session_id, det, now, d)
        if d.fire:
            det.mark_asked(now, d.subject)
            msg = {
                "subject": d.subject.text,
                "event_id": d.subject.event_id,
                "question_index": det.asked,
                "budget": self.cfg.max_questions,
            }
            self.store.append_pause_log(session_id, {"t": self._t(det, now), "ask_now": msg})
            await self.hub.publish(session_id, "ask_now", msg)
        return d

    def _log_transition(self, sid: str, det: PauseDetector, now: float, d: Decision) -> None:
        """Log whenever the set of blockers changes. A single blocker is a near-miss."""
        if self._last_blocked.get(sid) == d.blocked_by:
            return
        self._last_blocked[sid] = d.blocked_by
        if d.blocked_by:
            entry = {
                "t": self._t(det, now),
                "blocked_by": list(d.blocked_by),
                "near_miss": len(d.blocked_by) == 1,
            }
            self.store.append_pause_log(sid, entry)

    @staticmethod
    def _t(det: PauseDetector, now: float) -> float:
        return round(now - det.started_at, 2)
