import httpx
from fastapi.testclient import TestClient

from apprentice.llm.client import LlmClient
from apprentice.main import app, get_llm


def health_with(handler) -> dict:
    llm = LlmClient(transport=httpx.MockTransport(handler))
    app.dependency_overrides[get_llm] = lambda: llm
    try:
        with TestClient(app) as c:
            return c.get("/health").json()
    finally:
        app.dependency_overrides.clear()


def test_health_ok():
    body = health_with(
        lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "p"}}]})
    )
    assert body == {"server": "ok", "model": "ok"}


def test_health_model_500():
    assert health_with(lambda r: httpx.Response(500))["model"] == "down"


def test_health_unreachable():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    assert health_with(refuse) == {"server": "ok", "model": "down"}
