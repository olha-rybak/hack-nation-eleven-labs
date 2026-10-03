import json
import os
import re
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _at_or_after(entry: dict, cutoff_ms: int) -> bool:
    ts = entry.get("ts_ms")
    return isinstance(ts, int) and ts >= cutoff_ms


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

    def save_frame(self, session_id: str, ts_ms: int, image: bytes) -> str:
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
        self._append(session_id, "frames.jsonl", {"ts_ms": ts_ms, "frame_ref": None})

    def frames(self, session_id: str) -> list[dict]:
        return self._read(session_id, "frames.jsonl")

    def frame_path(self, session_id: str, frame_ref: str) -> Path:
        d = self._existing_dir(session_id).resolve()
        p = (d / frame_ref).resolve()
        if not p.is_relative_to(d):
            raise ValueError(f"invalid frame ref: {frame_ref!r}")
        return p

    def append_event(self, session_id: str, event: dict) -> None:
        self._append(session_id, "events.jsonl", event)

    def events(self, session_id: str) -> list[dict]:
        folded: dict = {}
        for ev in self._read(session_id, "events.jsonl"):
            folded[ev.get("id")] = ev  # dict keeps first-insertion position
        return list(folded.values())

    def append_transcript(self, session_id: str, line: dict) -> None:
        self._append(session_id, "transcript.jsonl", line)

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

    def delete_window(self, session_id: str, seconds: float) -> dict:
        """Remove everything in the last `seconds` of the session's own clock, from disk.

        The only place that deletes session data (T-400 off the record).
        """
        d = self._existing_dir(session_id)
        with self._lock(session_id):
            files = {
                name: self._load(d / f"{name}.jsonl")
                for name in ("frames", "events", "transcript", "pause")
            }
            stamps = [
                e["ts_ms"]
                for name in ("frames", "events", "transcript")
                for e in files[name]
                if isinstance(e.get("ts_ms"), int)
            ]
            if not stamps:
                return {
                    "from_ts_ms": 0,
                    "frames": 0,
                    "events": 0,
                    "transcript": 0,
                    "deleted_event_ids": [],
                    "reverted_events": [],
                }
            cutoff = max(stamps) - int(seconds * 1000)

            def keep(entries: list[dict]) -> list[dict]:
                return [e for e in entries if not _at_or_after(e, cutoff)]

            frames = keep(files["frames"])
            events = keep(files["events"])
            transcript = keep(files["transcript"])
            surviving = {e.get("id") for e in events}
            touched = list(
                dict.fromkeys(e.get("id") for e in files["events"] if _at_or_after(e, cutoff))
            )
            deleted_ids = [i for i in touched if i not in surviving]
            # an ask_now subject quotes the event as it was then, possibly an off-the-record value
            pause = [
                e for e in files["pause"] if (e.get("ask_now") or {}).get("event_id") not in touched
            ]
            folded = {e.get("id"): e for e in events}
            reverted = [folded[i] for i in touched if i in surviving]

            for e in files["frames"]:
                if _at_or_after(e, cutoff) and e.get("frame_ref"):
                    self.frame_path(session_id, e["frame_ref"]).unlink(missing_ok=True)
            for jpg in (d / "frames").glob("*.jpg"):
                if jpg.stem.isdigit() and int(jpg.stem) >= cutoff:
                    jpg.unlink(missing_ok=True)

            for name, entries in (
                ("frames", frames),
                ("events", events),
                ("transcript", transcript),
                ("pause", pause),
            ):
                self._rewrite(d / f"{name}.jsonl", entries)

        return {
            "from_ts_ms": cutoff,
            "frames": len(files["frames"]) - len(frames),
            "events": len(files["events"]) - len(events),
            "transcript": len(files["transcript"]) - len(transcript),
            "deleted_event_ids": deleted_ids,
            "reverted_events": reverted,
        }

    @staticmethod
    def _load(path: Path) -> list[dict]:
        if not path.exists():
            return []
        out = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except ValueError:
                    continue
                if isinstance(obj, dict):
                    out.append(obj)
        return out

    @staticmethod
    def _rewrite(path: Path, entries: list[dict]) -> None:
        if not path.exists():
            return
        tmp = path.with_name(path.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            for e in entries:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
