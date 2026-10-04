#!/usr/bin/env python3
"""Create the demo expert session `demo-brandt` for a server-mode run (VITE_MOCK=0).

The nav opens `demo-brandt` until a real session finishes (apps/web/src/lib/lastSession.ts), but on a
real server nothing creates it. This writes the confirmed returns-desk Work Map
(apps/server/tests/fixtures/workmap_returns.json) and the returns-desk screenshots as its frames, so
/teach/demo-brandt and the Vault work without recording an expert first.

Usage, from the repo root:  python3 scripts/seed_demo_session.py [sessions_dir] [--force]
sessions_dir defaults to $SESSIONS_DIR or data/sessions, the server's default.
"""

import json
import os
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SESSION = "demo-brandt"
WORKMAP = REPO / "apps/server/tests/fixtures/workmap_returns.json"
FRAMES = REPO / "apps/web/public/mock-frames"  # <ms>.jpg, one per screen moment in the map


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--force"]
    root = Path(args[0] if args else os.environ.get("SESSIONS_DIR", "data/sessions"))
    if not root.is_absolute():
        root = REPO / root
    session = root / SESSION
    if (session / "workmap.json").exists() and "--force" not in sys.argv:
        print(f"{session} already has a Work Map; pass --force to overwrite it.")
        return 1

    workmap = json.loads(WORKMAP.read_text(encoding="utf-8"))
    workmap["session_id"] = SESSION  # frames are looked up in the map's own session
    (session / "frames").mkdir(parents=True, exist_ok=True)
    meta = session / "meta.json"
    if not meta.exists():
        data = {
            "session_id": SESSION,
            "role": "interviewer",
            "created_at": datetime.now(UTC).isoformat(),
        }
        meta.write_text(json.dumps(data), encoding="utf-8")

    moments = sorted(
        {s["frame_ts"] for s in workmap["steps"]} | {g["frame_ts"] for g in workmap["guardrails"]}
    )
    lines = []
    for ts in moments:
        src = FRAMES / f"{ts}.jpg"
        if not src.exists():
            print(f"warning: no screenshot for {ts} ms, that moment shows as unavailable")
            continue
        ref = f"frames/{ts:010d}.jpg"
        shutil.copyfile(src, session / ref)
        lines.append(json.dumps({"ts_ms": ts, "frame_ref": ref}))
    (session / "frames.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (session / "workmap.json").write_text(json.dumps(workmap, indent=2), encoding="utf-8")
    print(f"Seeded {session}: confirmed Work Map, {len(lines)} frames. Open /teach/{SESSION}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
