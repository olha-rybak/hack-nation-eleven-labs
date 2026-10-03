"""Replay a folder of screenshots into a running server, then print the session's events.

Usage: python scripts/replay_frames.py <frames_dir> [--session ID] [--interval-ms 1000] [--url URL]

Frames are sent in filename order; frame_ts = index * interval. Use this for the T-103 acceptance
check (a recorded fake-ERP session should read as a correct account of what happened).
"""

import argparse
import sys
import time
import uuid
from pathlib import Path

import httpx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir", type=Path)
    ap.add_argument("--session", default=f"replay-{uuid.uuid4().hex[:6]}")
    ap.add_argument("--interval-ms", type=int, default=1000)
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument(
        "--settle-sec", type=float, default=120, help="max wait for the model to finish"
    )
    args = ap.parse_args()

    files = sorted(p for p in args.frames_dir.iterdir() if p.suffix.lower() in {".jpg", ".png"})
    if not files:
        sys.exit(f"no .jpg/.png in {args.frames_dir}")
    with httpx.Client(base_url=args.url, timeout=30) as c:
        for i, f in enumerate(files):
            r = c.post(
                "/ingest/frame",
                params={"session_id": args.session, "frame_ts": i * args.interval_ms},
                content=f.read_bytes(),
            )
            r.raise_for_status()
            print(f"sent {f.name} -> {r.json()['frame_ref']}")
            time.sleep(args.interval_ms / 1000)

        # wait until the event list stops changing (model is slower than the frame rate)
        last, stable, end = None, 0, time.monotonic() + args.settle_sec
        while time.monotonic() < end and stable < 3:
            events = c.get(f"/sessions/{args.session}/events").json()
            stable = stable + 1 if events == last else 0
            last = events
            time.sleep(2)

    print(f"\nsession {args.session}: {len(last or [])} events")
    for e in last or []:
        change = f"{e['field']}: {e['before']!r} -> {e['after']!r}" if e["kind"] == "edit" else ""
        when, conf = e["ts_ms"] / 1000, e["confidence"]
        print(f"{when:7.1f}s  {e['kind']:<8} {e['entity']:<20} {change}  ({conf:.2f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
