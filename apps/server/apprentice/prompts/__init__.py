from functools import cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent


@cache
def load(name: str) -> str:
    """Load a prompt file by relative name, e.g. load("vision/events")."""
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
