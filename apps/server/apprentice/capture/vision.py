"""Frames -> events on the vision slot (slot 0). See docs/tickets/T-103-vision-events.md."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from apprentice import prompts
from apprentice.capture.events import Event, RawEvent, parse_model_events, to_events
from apprentice.llm.client import LlmClient, LlmError
from apprentice.privacy.redactor import Redactor
from apprentice.session.hub import Hub
from apprentice.session.store import SessionStore
from apprentice.settings import Settings

log = logging.getLogger(__name__)

VISION_SLOT = 0
RECENT_EVENTS_IN_PROMPT = 5


@dataclass
class Frame:
    ts_ms: int
    ref: str
    image: bytes


@dataclass
class _SessionState:
    keyframe: Frame | None = None  # last frame the model has seen; next diff starts here
    pending: Frame | None = None  # newest unprocessed frame; older ones are superseded
    task: asyncio.Task | None = None


class VisionService:
    """Per session: diff the last processed keyframe against the newest changed frame.

    Latest-wins instead of a queue: the model is slower than the frame rate, and a diff from the old
    keyframe to the newest frame still covers every change in between.
    """

    def __init__(
        self,
        llm: LlmClient,
        store: SessionStore,
        hub: Hub,
        settings: Settings,
        redactor: Redactor,
        on_event: Callable[[str], None] | None = None,
        on_events: Callable[[str, list[dict]], Awaitable[None]] | None = None,
    ):
        self.llm, self.store, self.hub, self.settings = llm, store, hub, settings
        self.redactor = redactor
        self.on_event = on_event  # e.g. pause detector: an accepted event is screen activity
        self.on_events = on_events  # e.g. live guardrails: evaluate each accepted event
        self._sessions: dict[str, _SessionState] = {}
        self.brief: str | None = None  # environment brief from T-109, once it exists

    def submit(self, session_id: str, frame: Frame) -> None:
        st = self._sessions.setdefault(session_id, _SessionState())
        if st.keyframe is None:
            st.keyframe = frame  # first frame is the baseline; nothing to diff yet
            return
        st.pending = frame
        if st.task is None or st.task.done():
            st.task = asyncio.create_task(self._run(session_id, st))

    def reset(self, session_id: str) -> None:
        """Forget the keyframe and any pending frame, e.g. when the session is archived."""
        if st := self._sessions.pop(session_id, None):
            if st.task:
                st.task.cancel()

    async def _run(self, session_id: str, st: _SessionState) -> None:
        while st.pending is not None:
            cur, st.pending = st.pending, None
            try:
                events = await self.extract(session_id, st.keyframe, cur)
            except LlmError as e:
                log.warning("vision failed for %s at %d: %s", session_id, cur.ts_ms, e)
                continue  # keep the old keyframe so the next diff still covers this change
            st.keyframe = cur
            for ev in events:
                self.store.append_event(session_id, ev.model_dump())
                await self.hub.publish(session_id, "event", ev.model_dump())
            if events and self.on_event:
                self.on_event(session_id)
            if events and self.on_events:
                await self.on_events(session_id, [ev.model_dump() for ev in events])

    async def extract(self, session_id: str, prev: Frame, cur: Frame) -> list[Event]:
        recent = [Event.model_validate(e) for e in self.store.events(session_id)]
        reply = await self.llm.chat(
            VISION_SLOT,
            [{"role": "user", "content": self._prompt(recent)}],
            images=[prev.image, cur.image],
            max_tokens=self.settings.VISION_MAX_TOKENS,
            temperature=0.1,
            extra={"chat_template_kwargs": {"enable_thinking": self.settings.VISION_THINKING}},
        )
        raw = await asyncio.to_thread(self._redact, session_id, parse_model_events(reply))
        last = recent[-1] if recent else None
        return to_events(raw, last, cur.ts_ms, cur.ref, self.settings.EVENT_MIN_CONFIDENCE)

    def _redact(self, session_id: str, raw: list[RawEvent]) -> list[RawEvent]:
        red = self.redactor
        out = []
        for r in raw:
            update = {"entity": red.text(session_id, r.entity)}
            for name in ("before", "after"):
                if isinstance(v := getattr(r, name), str):
                    update[name] = red.text(session_id, v)
            if r.fields:
                update["fields"] = {
                    k: red.text(session_id, v) if isinstance(v, str) else v
                    for k, v in r.fields.items()
                }
            out.append(r.model_copy(update=update))
        return out

    def _prompt(self, recent: list[Event]) -> str:
        parts = []
        if self.brief:
            parts.append(f"About this application:\n{self.brief}")
        if recent:
            lines = "\n".join(_line(e) for e in recent[-RECENT_EVENTS_IN_PROMPT:])
            parts.append(f"Events so far (do not repeat them):\n{lines}")
        # .replace, not .format: the prompt contains literal JSON braces
        return prompts.load("vision/events").replace("{context}", "\n\n".join(parts))


def _line(e: Event) -> str:
    if e.kind == "edit":
        return f"- edit {e.entity}: {e.field} {e.before!r} -> {e.after!r}"
    return f"- {e.kind} {e.entity}"
