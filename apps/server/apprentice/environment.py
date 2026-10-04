"""Environment config pack (T-109): documented facts about the app, and the brief made from them.

The pack is every *.md under config/environment/: app, glossary, rules, task, then screens/*.md.
The brief is written once per pack hash by the Work Map LLM and cached on disk.
"""

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel

from apprentice.llm.structured import StructuredLlm
from apprentice.prompts import load

log = logging.getLogger(__name__)

TOP_LEVEL = ("app.md", "glossary.md", "rules.md", "task.md")


class Brief(BaseModel):
    brief: str


@dataclass(frozen=True)
class Pack:
    files: dict[str, str]
    hash: str


def load_pack(path: Path) -> Pack | None:
    top = [path / name for name in TOP_LEVEL]
    screens = sorted((path / "screens").glob("*.md"))
    files = {
        p.relative_to(path).as_posix(): p.read_text(encoding="utf-8")
        for p in [*top, *screens]
        if p.is_file()
    }
    if not files:
        return None
    digest = hashlib.sha256()
    for name in sorted(files):
        digest.update(f"{name}\0{files[name]}\0".encode())
    return Pack(files, digest.hexdigest()[:16])


def pack_text(pack: Pack) -> str:
    return "\n\n".join(f"## {name}\n{text.strip()}" for name, text in pack.files.items())


async def get_brief(pack: Pack, llm: StructuredLlm, cache_dir: Path) -> str:
    cached = cache_dir / f"brief-{pack.hash}.md"
    if cached.is_file():
        return cached.read_text(encoding="utf-8")
    try:
        brief = (await llm.parse(load("environment/brief"), pack_text(pack), Brief)).brief
    except Exception:
        log.warning("environment brief failed, using the raw pack", exc_info=True)
        return pack_text(pack)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached.write_text(brief, encoding="utf-8")
    return brief
