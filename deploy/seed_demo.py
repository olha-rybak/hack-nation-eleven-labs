"""Seed the recorded returns-desk session (demo-brandt) on first start, so a fresh deploy's Vault
has an example. Its frames are the returns-desk screenshots the web app also uses in mock mode.
Does nothing when the session already exists, so real data on the volume is never touched."""

import os
import shutil
from pathlib import Path

from apprentice.session.store import SessionStore

REPO = Path(__file__).resolve().parents[1]
WORKMAP = REPO / "apps/server/tests/fixtures/workmap_returns.json"
FRAMES = REPO / "apps/web/public/mock-frames"
SESSION = "demo-brandt"


def main() -> None:
    root = Path(os.environ.get("SESSIONS_DIR", "data/sessions"))
    store = SessionStore(root if root.is_absolute() else REPO / root)
    if store.exists(SESSION):
        return
    store.create(SESSION)
    target = store.session_dir(SESSION)
    for frame in FRAMES.glob("*.jpg"):
        shutil.copy(frame, target / "frames" / f"{int(frame.stem):010d}.jpg")
    shutil.copy(WORKMAP, target / "workmap.json")
    print(f"seeded {SESSION} in {store.root}")


if __name__ == "__main__":
    main()
