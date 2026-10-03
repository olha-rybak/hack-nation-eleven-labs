import json
import os
import re
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class SessionStore:
    """Append-only on-disk session log. All state lives on disk."""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _lock(self, session_id: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(session_id, threading.Lock())

    def _dir(self, session_id: str) -> Path:
        if not isinstance(session_id, str) or not _ID_RE.match(session_id):
            raise ValueError(f"invalid session id: {session_id!r}")
        return self.root / session_id

    def _existing_dir(self, session_id: str) -> Path:
        d = self._dir(session_id)
        if not (d / "meta.json").is_file():
            raise KeyError(session_id)
        return d

    def create(self, session_id: str | None = None, role: str = "interviewer") -> str:
        sid = session_id or uuid.uuid4().hex[:12]
        d = self._dir(sid)
        with self._lock(sid):
            (d / "frames").mkdir(parents=True, exist_ok=True)
            meta = d / "meta.json"
            if not meta.exists():
                data = {
                    "session_id": sid,
                    "role": role,
                    "created_at": datetime.now(UTC).isoformat(),
                }
                meta.write_text(json.dumps(data), encoding="utf-8")
        return sid

    def exists(self, session_id: str) -> bool:
        return (self._dir(session_id) / "meta.json").is_file()

    def meta(self, session_id: str) -> dict:
        d = self._existing_dir(session_id)
        return json.loads((d / "meta.json").read_text(encoding="utf-8"))

    def _append(self, session_id: str, name: str, obj: dict) -> None:
        d = self._existing_dir(session_id)
        line = json.dumps(obj, ensure_ascii=False) + "\n"
        with self._lock(session_id), open(d / name, "a", encoding="utf-8") as f:
            f.write(line)
            f.flush()

    def _read(self, session_id: str, name: str) -> list[dict]:
        d = self._existing_dir(session_id)
        path = d / name
        if not path.exists():
            return []
        out = []
        with self._lock(session_id), open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if isinstance(obj, dict):
                    out.append(obj)
        return out

    def save_frame(self, session_id: str, ts_ms: int, image: bytes) -> str | None:
        """Returns None, writing nothing, when ts_ms falls in an off-the-record window."""
        if self.is_off_record(session_id, ts_ms):
            return None
        d = self._existing_dir(session_id)
        ref = f"frames/{ts_ms:010d}.jpg"
        with self._lock(session_id):
            (d / "frames").mkdir(exist_ok=True)
            with open(d / ref, "wb") as f:
                f.write(image)
                f.flush()
        self._append(session_id, "frames.jsonl", {"ts_ms": ts_ms, "frame_ref": ref})
        return ref

    def record_tick(self, session_id: str, ts_ms: int) -> None:
        if self.is_off_record(session_id, ts_ms):
            return
        self._append(session_id, "frames.jsonl", {"ts_ms": ts_ms, "frame_ref": None})

    def frames(self, session_id: str) -> list[dict]:
        return self._read(session_id, "frames.jsonl")

    def frame_path(self, session_id: str, frame_ref: str) -> Path:
        d = self._existing_dir(session_id).resolve()
        p = (d / frame_ref).resolve()
        if not p.is_relative_to(d):
            raise ValueError(f"invalid frame ref: {frame_ref!r}")
        return p

    def append_event(self, session_id: str, event: dict) -> bool:
        """False when the event falls in an off-the-record window (a late vision result)."""
        if self.is_off_record(session_id, event.get("ts_ms")):
            return False
        self._append(session_id, "events.jsonl", event)
        return True

    def events(self, session_id: str) -> list[dict]:
        folded: dict = {}
        for ev in self._read(session_id, "events.jsonl"):
            folded[ev.get("id")] = ev  # dict keeps first-insertion position
        return list(folded.values())

    def append_transcript(self, session_id: str, line: dict) -> bool:
        if self.is_off_record(session_id, line.get("ts_ms")):
            return False
        self._append(session_id, "transcript.jsonl", line)
        return True

    def transcript(self, session_id: str) -> list[dict]:
        return self._read(session_id, "transcript.jsonl")

    def append_pause_log(self, session_id: str, entry: dict) -> None:
        """Pause-detector decisions and near-misses, for tuning thresholds (T-104)."""
        self._append(session_id, "pause.jsonl", entry)

    def pause_log(self, session_id: str) -> list[dict]:
        return self._read(session_id, "pause.jsonl")

    def archive(self, session_id: str) -> str:
        """Rename the session to <id>-<UTC timestamp>, freeing the id. Nothing is deleted."""
        d = self._existing_dir(session_id)
        new_id = f"{session_id}-{datetime.now(UTC):%Y%m%dT%H%M%S}"
        with self._lock(session_id):
            d.rename(self._dir(new_id))
        return new_id

    def off_record_windows(self, session_id: str) -> list[dict]:
        return self._read(session_id, "off_record.jsonl")

    def is_off_record(self, session_id: str, ts_ms: int | None) -> bool:
        if ts_ms is None:
            return False
        windows = self.off_record_windows(session_id)
        return any(w["from_ts"] <= ts_ms <= w["until_ts"] for w in windows)

    def delete_window(self, session_id: str, until_ts: int, window_ms: int) -> dict:
        """Off the record: delete frames, events and transcript lines with
        until_ts - window_ms <= ts_ms <= until_ts, from disk, not just from view.

        The window is remembered (numbers only, no content) so that a frame or vision result
        still in flight when the expert asked is dropped when it lands. This is the one place
        in the codebase allowed to remove session data.
        """
        d = self._existing_dir(session_id)
        from_ts = max(0, until_ts - window_ms)

        def inside(obj: dict) -> bool:
            ts = obj.get("ts_ms")
            return isinstance(ts, int) and from_ts <= ts <= until_ts

        self._append(session_id, "off_record.jsonl", {"from_ts": from_ts, "until_ts": until_ts})
        with self._lock(session_id):
            frames, gone_frames = self._partition(d / "frames.jsonl", inside)
            events, gone_events = self._partition(d / "events.jsonl", inside)
            lines, gone_lines = self._partition(d / "transcript.jsonl", inside)
            event_ids = {e.get("id") for e in gone_events} - {None}

            def about_deleted(entry: dict) -> bool:
                return (entry.get("ask_now") or {}).get("event_id") in event_ids

            pause, _ = self._partition(d / "pause.jsonl", about_deleted)
            for path, rows in (
                (d / "frames.jsonl", frames),
                (d / "events.jsonl", events),
                (d / "transcript.jsonl", lines),
                (d / "pause.jsonl", pause),
            ):
                self._rewrite(path, rows)
            for f in gone_frames:
                if f.get("frame_ref"):
                    (d / f["frame_ref"]).unlink(missing_ok=True)
        return {
            "from_ts": from_ts,
            "until_ts": until_ts,
            "frames": len(gone_frames),
            "events": len(event_ids),
            "transcript": len(gone_lines),
            "event_ids": sorted(event_ids),
        }

    @staticmethod
    def _partition(path: Path, predicate) -> tuple[list[dict], list[dict]]:
        kept: list[dict] = []
        gone: list[dict] = []
        if not path.exists():
            return kept, gone
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if isinstance(obj, dict):
                    (gone if predicate(obj) else kept).append(obj)
        return kept, gone

    @staticmethod
    def _rewrite(path: Path, rows: list[dict]) -> None:
        if not path.exists() and not rows:
            return
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
