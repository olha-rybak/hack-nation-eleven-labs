from types import SimpleNamespace

import anthropic
import httpx
import pytest

from apprentice.llm.claude_vision import ClaudeVisionClient
from apprentice.llm.client import LlmError
from apprentice.settings import Settings

PNG = b"\x89PNGfake"
JPG = b"\xff\xd8fake"


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls = response, error, []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


class FakeAnthropic:
    def __init__(self, messages: FakeMessages):
        self.beta = SimpleNamespace(messages=messages)

    def with_options(self, **_):
        return self


def reply(text="{}", stop_reason="end_turn"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)], stop_reason=stop_reason
    )


def make(model="claude-haiku-4-5", **fake):
    messages = FakeMessages(**fake)
    client = ClaudeVisionClient(Settings(VISION_MODEL=model), client=FakeAnthropic(messages))
    return client, messages


async def test_images_come_first_in_order_then_the_prompt():
    client, messages = make(response=reply('{"events": []}'))
    out = await client.chat(0, [{"role": "user", "content": "what changed"}], images=[JPG, PNG])
    assert out == '{"events": []}'
    content = messages.calls[0]["messages"][-1]["content"]
    assert [b["type"] for b in content] == ["image", "image", "text"]
    assert [b["source"]["media_type"] for b in content[:2]] == ["image/jpeg", "image/png"]
    assert content[2]["text"] == "what changed"


async def test_haiku_sends_no_effort_or_fallback():
    client, messages = make(response=reply())
    await client.chat(0, [{"role": "user", "content": "x"}], temperature=0.1, extra={"a": 1})
    call = messages.calls[0]
    assert call["model"] == "claude-haiku-4-5"
    assert not {"output_config", "betas", "fallbacks", "temperature"} & call.keys()


async def test_sonnet_sends_effort_and_default_fallback():
    client, messages = make(model="claude-sonnet-5-5", response=reply())
    await client.chat(0, [{"role": "user", "content": "x"}])
    call = messages.calls[0]
    assert call["output_config"] == {"effort": "low"}
    assert call["fallbacks"] == "default"


async def test_refusal_and_api_errors_become_llm_errors():
    client, _ = make(response=reply(stop_reason="refusal"))
    with pytest.raises(LlmError):
        await client.chat(0, [{"role": "user", "content": "x"}])
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    client, _ = make(error=anthropic.APIConnectionError(request=req))
    with pytest.raises(LlmError):
        await client.chat(0, [{"role": "user", "content": "x"}])
