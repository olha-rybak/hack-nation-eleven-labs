"""Usage: uv run python scripts/diff_screens.py before.png after.png"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apprentice.llm.client import LlmClient, LlmError

PROMPT = (
    "You are given two screenshots: the first is before, the second is after. "
    "List briefly, as plain text, what changed between them."
)


async def main(before: str, after: str) -> int:
    images = [Path(before).read_bytes(), Path(after).read_bytes()]
    llm = LlmClient()
    try:
        print(await llm.chat(0, [{"role": "user", "content": PROMPT}], images=images))
    except LlmError as e:
        print(f"error: model is not available ({e})", file=sys.stderr)
        return 1
    finally:
        await llm.aclose()
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: diff_screens.py before.png after.png")
    sys.exit(asyncio.run(main(sys.argv[1], sys.argv[2])))
