"""Guardrails on a live tutor session (T-300): every accepted event goes through the engine.

A tutor session is created with the expert session whose confirmed Work Map it teaches from. Hits
are pushed on the session websocket as soon as the event that caused them is accepted, so the tutor
can speak before Save. A guardrail stops being violated -> `guardrail_resolved`; dismissing the
evidence in the UI is not resolution.
"""

import logging

from apprentice.guardrails.engine import GuardrailEngine, Hit
from apprentice.knowledge.graph import KnowledgeGraph, nodes_for_event
from apprentice.session.hub import Hub
from apprentice.session.store import SessionStore
from apprentice.workmap.schema import WorkMap

log = logging.getLogger(__name__)

WORKMAP_FILE = "workmap.json"  # the confirmed, frozen map (T-204) in the expert's session folder


class NoWorkMap(Exception):
    """The expert session has no confirmed Work Map file yet."""


def load_workmap(store: SessionStore, session_id: str) -> WorkMap:
    path = store.session_dir(session_id) / WORKMAP_FILE
    if not path.is_file():
        raise NoWorkMap(session_id)
    return WorkMap.model_validate_json(path.read_text(encoding="utf-8"))


def _key(entity: str) -> str:
    return " ".join(entity.split()).casefold()


class LiveGuardrails:
    def __init__(
        self,
        store: SessionStore,
        hub: Hub,
        knowledge: KnowledgeGraph | None = None,
        known_max_facts: int = 10,
        known_max_chars: int = 2000,
    ) -> None:
        self.store, self.hub, self.knowledge = store, hub, knowledge
        self.known_max_facts, self.known_max_chars = known_max_facts, known_max_chars
        self._engines: dict[str, GuardrailEngine | None] = {}
        self._pending: dict[str, dict[str, set[str]]] = {}  # session -> entity -> guardrail ids

    def attach(self, session_id: str, work_map_session_id: str) -> GuardrailEngine:
        """Raises KeyError (unknown session), NoWorkMap, NotConfirmed."""
        engine = GuardrailEngine(load_workmap(self.store, work_map_session_id))
        self._engines[session_id] = engine
        self._pending.pop(session_id, None)
        return engine

    def engine(self, session_id: str) -> GuardrailEngine | None:
        """The session's engine; rebuilt from meta after a server restart."""
        if session_id not in self._engines:
            try:
                meta = self.store.meta(session_id)
            except (KeyError, ValueError):
                return None  # not a stored session; never block event intake on it
            source = meta.get("work_map_id") if meta.get("role") == "tutor" else None
            self._engines[session_id] = None
            if source:
                try:
                    self.attach(session_id, source)
                except Exception as e:  # noqa: BLE001 - a broken map must not stop the capture
                    log.warning(
                        "tutor session %s: cannot load work map %s: %s", session_id, source, e
                    )
        return self._engines[session_id]

    async def on_events(self, session_id: str, events: list[dict]) -> None:
        engine = self.engine(session_id)
        if engine is None:
            return
        for event in events:
            for type, data in self.evaluate(session_id, engine, event):
                self.store.append_guardrail(session_id, {"type": type, **data})
                await self.hub.publish(session_id, type, data)

    def evaluate(
        self, session_id: str, engine: GuardrailEngine, event: dict
    ) -> list[tuple[str, dict]]:
        entity, ts, event_id = event["entity"], event.get("ts_ms"), event.get("id")
        firing_before = engine.firing(entity)
        hits = engine.on_event(event)
        resolved = firing_before - engine.firing(entity)

        # Save-triggered guardrails ("no asset number, no capex") would only fire on the save.
        # Report them as soon as saving would break them, resolved once it no longer would.
        pending = {h.guardrail_id: h for h in engine.pending(entity)}
        was_pending = self._pending.setdefault(session_id, {}).get(_key(entity), set())
        self._pending[session_id][_key(entity)] = set(pending)
        hits += [h for gid, h in pending.items() if gid not in was_pending]
        resolved |= was_pending - set(pending)

        source = engine.workmap.session_id
        known = self._known(session_id, event) if hits else []
        out = [("guardrail_hit", _hit(h, source, ts) | {"known": known}) for h in hits]
        out += [
            (
                "guardrail_resolved",
                {"guardrail_id": gid, "entity": entity, "event_id": event_id, "ts_ms": ts},
            )
            for gid in sorted(resolved)
        ]
        return out

    def _known(self, session_id: str, event: dict) -> list[dict]:
        """What experts said before about this supplier, field and values (T-110), so the tutor
        can quote more than the guardrail's own reason."""
        if self.knowledge is None:
            return []
        nodes = nodes_for_event(event, self.store.events(session_id))
        return self.knowledge.known(nodes, self.known_max_facts, self.known_max_chars)


def _hit(h: Hit, source_session_id: str, ts_ms: int | None) -> dict:
    return {
        "guardrail_id": h.guardrail_id,
        "severity": h.severity,
        "statement": h.statement,
        "reason": h.reason.model_dump(mode="json"),
        "entity": h.entity,
        "event_id": h.event_id,
        "frame_refs": h.frame_refs,  # GET /sessions/{source_session_id}/frames/{name}
        "source_session_id": source_session_id,
        "timing": h.timing,
        "ts_ms": ts_ms,
    }
