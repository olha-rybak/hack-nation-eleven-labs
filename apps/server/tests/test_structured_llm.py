import json

import httpx2
import pytest
from anthropic import AsyncAnthropic, DefaultAsyncHttpxClient
from pydantic import BaseModel

from apprentice.llm.structured import ClaudeLlm, StructuredLlmError
from apprentice.settings import Settings


class Answer(BaseModel):
    title: str
    count: int


def claude(reply_text: str, stop_reason: str = "end_turn"):
    seen = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append((request, json.loads(request.content)))
        return httpx2.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5-5",
                "content": [{"type": "text", "text": reply_text}],
                "stop_reason": stop_reason,
                "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 5},
            },
        )

    client = AsyncAnthropic(
        api_key="test",
        http_client=DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    return ClaudeLlm(Settings(MAP_LLM_EFFORT="high"), client=client), seen


async def test_request_shape_and_parsed_reply():
    llm, seen = claude('{"title": "Invoices", "count": 3}')
    out = await llm.parse("system text", "user text", Answer)
    assert out == Answer(title="Invoices", count=3)
    request, body = seen[0]
    assert body["model"] == "claude-opus-5-5"
    assert body["system"] == "system text"
    assert body["messages"] == [{"role": "user", "content": "user text"}]
    assert body["output_config"]["effort"] == "high"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert set(body["output_config"]["format"]["schema"]["properties"]) == {"title", "count"}
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in request.headers["anthropic-beta"]


@pytest.mark.parametrize("stop", ["refusal", "max_tokens"])
async def test_refusal_and_truncation_raise(stop):
    llm, _ = claude('{"title": "x", "count": 1}', stop_reason=stop)
    with pytest.raises(StructuredLlmError):
        await llm.parse("s", "u", Answer)
