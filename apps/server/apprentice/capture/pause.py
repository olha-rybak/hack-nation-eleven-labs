"""When may the agent speak? See docs/tickets/T-104-pause-detector.md.

The agent never decides this itself. All four ticket conditions must hold, plus two guards:
there is something new to ask about, and the agent is not already talking.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from apprentice.knowledge.graph import KnowledgeGraph, nodes_for_event
from apprentice.session.hub import Hub
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

log = logging.getLogger(__name__)

# Order matters only for readability of logs.
CONDITIONS = ("screen_still", "silent", "agent_quiet", "cooldown", "budget", "subject")
# Events worth an interruption, most interesting first; open/navigate are rarely a "why".
SUBJECT_PRIORITY = {"edit": 0, "hold": 0, "route": 0, "save": 1, "unknown": 2, "open": 3}
# A guardrail on screen: something stopped, or sent to someone else to decide.
GUARDRAIL_KINDS = {"hold", "route"}


@dataclass(frozen=True)
class PauseConfig:
    screen_still_sec: float
    silence_sec: float
    cooldown_sec: float
    max_questions: int
    guardrail_by: int = 4  # question by which a guardrail question is forced (T-108)

    @classmethod
    def from_settings(cls, s: Settings) -> "PauseConfig":
        return cls(
            s.PAUSE_SCREEN_STILL_SEC,
            s.PAUSE_SILENCE_SEC,
            s.ASK_COOLDOWN_SEC,
            s.MAX_LIVE_QUESTIONS,
            s.GUARDRAIL_BY_QUESTION,
        )


@dataclass(frozen=True)
class Subject:
    event_id: str
    text: str  # one line the question writer (T-108) grounds its question in
    guardrail: bool = False  # ask for the limit, exception or stop-and-ask behind it


SubjectPicker = Callable[[list[dict], set[str], bool], Subject | None]


def pick_latest_subject(
    events: list[dict], asked: set[str], guardrail: bool = False
) -> Subject | None:
    """Placeholder for T-108: the most recent un-asked event, decisions before navigation.

    With `guardrail`, a hold or route wins; failing that, any decision, asked as a guardrail.
    """
    candidates = [
        (SUBJECT_PRIORITY[e["kind"]], -i, e)
        for i, e in enumerate(events)
        if e["id"] not in asked and e["kind"] in SUBJECT_PRIORITY
    ]
    if guardrail:
        held = [c for c in candidates if c[2]["kind"] in GUARDRAIL_KINDS]
        candidates = held or [c for c in candidates if c[0] <= 1]  # decisions, not opens
    if not candidates:
        return None
    e = min(candidates, key=lambda c: c[:2])[2]
    if e["kind"] == "edit":
        text = f"{e['entity']}: {e['field']} changed from {e['before']!r} to {e['after']!r}"
    else:
        text = f"{e['entity']}: {e['kind']}"
    return Subject(e["id"], text, guardrail or e["kind"] in GUARDRAIL_KINDS)


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
    guardrail_asked: bool = False  # this session only; the knowledge graph spans sessions

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

    def needs_guardrail(self) -> bool:
        """The next question must be a guardrail one: none asked yet and the deadline is here."""
        deadline = min(self.cfg.guardrail_by, self.cfg.max_questions)
        return not self.guardrail_asked and self.asked + 1 >= deadline

    def mark_asked(self, now: float, subject: Subject) -> None:
        self.asked += 1
        self.last_asked = now
        self.asked_event_ids.add(subject.event_id)
        self.guardrail_asked |= subject.guardrail

    def restore(self, pause_log: list[dict]) -> None:
        """Pick up the questions already cued in this session, e.g. after a server restart."""
        for entry in pause_log:
            if ask := entry.get("ask_now"):
                self.asked += 1
                self.asked_event_ids.add(ask["event_id"])
                self.guardrail_asked |= bool(ask.get("guardrail"))


class PauseService:
    """Runs one detector per session on a ticker and pushes `ask_now` over the session websocket."""

    def __init__(
        self,
        store: SessionStore,
        hub: Hub,
        settings: Settings,
        pick: SubjectPicker = pick_latest_subject,
        clock: Callable[[], float] = time.monotonic,
        knowledge: KnowledgeGraph | None = None,
    ):
        self.store, self.hub, self.pick, self.clock = store, hub, pick, clock
        self.knowledge = knowledge
        self.known_max_facts = settings.KNOWN_MAX_FACTS
        self.known_max_chars = settings.KNOWN_MAX_CHARS
        self.cfg = PauseConfig.from_settings(settings)
        self.tick_sec = settings.PAUSE_TICK_SEC
        self.detectors: dict[str, PauseDetector] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._last_blocked: dict[str, tuple[str, ...]] = {}

    def detector(self, session_id: str) -> PauseDetector:
        if session_id not in self.detectors:
            det = self.detectors[session_id] = PauseDetector(self.cfg, self.clock())
            if self.store.exists(session_id):
                det.restore(self.store.pause_log(session_id))
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
        events = self.store.events(session_id)
        subject = self.pick(events, det.asked_event_ids, det.needs_guardrail())
        d = det.check(now, subject)
        self._log_transition(session_id, det, now, d)
        if d.fire:
            det.mark_asked(now, d.subject)
            msg = {
                "subject": d.subject.text,
                "event_id": d.subject.event_id,
                "guardrail": d.subject.guardrail,
                "question_index": det.asked,
                "budget": self.cfg.max_questions,
                "known": self._known(d.subject, events),
            }
            self.store.append_pause_log(session_id, {"t": self._t(det, now), "ask_now": msg})
            await self.hub.publish(session_id, "ask_now", msg)
        return d

    def _known(self, subject: Subject, events: list[dict]) -> list[dict]:
        """What the expert already told us about the subject, so the agent doesn't ask it again."""
        if self.knowledge is None:
            return []
        event = next(e for e in events if e["id"] == subject.event_id)
        nodes = nodes_for_event(event, events)
        return self.knowledge.known(nodes, self.known_max_facts, self.known_max_chars)

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
