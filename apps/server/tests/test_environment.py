import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apprentice.environment import Brief, get_brief, load_pack, pack_text
from apprentice.environment_routes import router


class FakeLlm:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    async def parse(self, system, user, schema):
        self.calls.append((system, user, schema))
        if self.fail:
            raise RuntimeError("boom")
        return Brief(brief=f"brief {len(self.calls)}")


@pytest.fixture
def pack_dir(tmp_path):
    root = tmp_path / "environment"
    (root / "screens").mkdir(parents=True)
    for name in ("task", "rules", "glossary", "app"):
        (root / f"{name}.md").write_text(f"{name} text", encoding="utf-8")
    (root / "screens" / "b.md").write_text("caption b", encoding="utf-8")
    (root / "screens" / "a.md").write_text("caption a", encoding="utf-8")
    (root / "screens" / "a.png").write_bytes(b"\x89PNG")
    return root


def test_load_pack_order_and_ignores_images(pack_dir):
    pack = load_pack(pack_dir)
    assert list(pack.files) == [
        "app.md", "glossary.md", "rules.md", "task.md", "screens/a.md", "screens/b.md",
    ]  # fmt: skip
    assert len(pack.hash) == 16
    assert pack_text(pack).startswith("## app.md\napp text\n\n## glossary.md")


def test_hash_changes_with_content(pack_dir):
    before = load_pack(pack_dir).hash
    assert load_pack(pack_dir).hash == before
    (pack_dir / "rules.md").write_text("changed", encoding="utf-8")
    assert load_pack(pack_dir).hash != before


def test_load_pack_missing_or_empty(tmp_path):
    assert load_pack(tmp_path / "nope") is None
    (tmp_path / "empty").mkdir()
    (tmp_path / "empty" / "shot.png").write_bytes(b"x")
    assert load_pack(tmp_path / "empty") is None


async def test_brief_cache_miss_then_hit(pack_dir, tmp_path):
    pack, llm, cache = load_pack(pack_dir), FakeLlm(), tmp_path / "cache"
    assert await get_brief(pack, llm, cache) == "brief 1"
    assert (cache / f"brief-{pack.hash}.md").read_text(encoding="utf-8") == "brief 1"
    assert llm.calls[0][1] == pack_text(pack)
    assert await get_brief(pack, llm, cache) == "brief 1"
    assert len(llm.calls) == 1


async def test_brief_regenerated_when_content_changes(pack_dir, tmp_path):
    llm, cache = FakeLlm(), tmp_path / "cache"
    await get_brief(load_pack(pack_dir), llm, cache)
    (pack_dir / "task.md").write_text("new task", encoding="utf-8")
    assert await get_brief(load_pack(pack_dir), llm, cache) == "brief 2"
    assert len(llm.calls) == 2


async def test_brief_llm_failure_falls_back_uncached(pack_dir, tmp_path):
    pack, cache = load_pack(pack_dir), tmp_path / "cache"
    assert await get_brief(pack, FakeLlm(fail=True), cache) == pack_text(pack)
    assert not cache.exists() or not list(cache.iterdir())


def client():
    app = FastAPI()
    app.include_router(router)
    app.state.environment_brief = None
    app.state.environment_hash = None
    return TestClient(app)


def test_route_not_ready():
    assert client().get("/environment/brief").json() == {
        "hash": None, "brief": None, "ready": False,
    }  # fmt: skip


def test_route_ready():
    c = client()
    c.app.state.environment_brief = "About the app"
    c.app.state.environment_hash = "abc"
    assert c.get("/environment/brief").json() == {
        "hash": "abc", "brief": "About the app", "ready": True,
    }  # fmt: skip
