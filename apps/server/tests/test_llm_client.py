import base64
import json

import httpx
import pytest

from apprentice.llm.client import LlmClient, LlmError

PNG = b"\x89PNG\r\n\x1a\n" + b"x"
JPG = b"\xff\xd8\xff" + b"x"


def make_client(handler) -> tuple[LlmClient, list[dict]]:
    seen: list[dict] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return handler(request)

    return LlmClient(transport=httpx.MockTransport(wrapped)), seen


def ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": "hello"}}]})


async def test_sends_id_slot_and_returns_content():
    client, seen = make_client(ok)
    out = await client.chat(1, [{"role": "user", "content": "hi"}], max_tokens=5, temperature=0.2)
    assert out == "hello"
    assert seen[0]["id_slot"] == 1
    assert seen[0]["max_tokens"] == 5
    assert seen[0]["temperature"] == 0.2


async def test_images_attached_to_last_user_message():
    client, seen = make_client(ok)
    msgs = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "a"},
        {"role": "user", "content": "what changed?"},
    ]
    await client.chat(0, msgs, images=[PNG, JPG])
    sent = seen[0]["messages"]
    assert sent[0]["content"] == "first"
    parts = sent[2]["content"]
    assert parts[0] == {"type": "text", "text": "what changed?"}
    assert parts[1]["image_url"]["url"] == "data:image/png;base64," + base64.b64encode(PNG).decode()
    assert parts[2]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert msgs[2]["content"] == "what changed?"  # caller's list untouched


async def test_500_raises_llm_error():
    client, _ = make_client(lambda r: httpx.Response(500, text="boom"))
    with pytest.raises(LlmError):
        await client.chat(0, [{"role": "user", "content": "hi"}])


async def test_malformed_response_raises_llm_error():
    client, _ = make_client(lambda r: httpx.Response(200, json={"nope": 1}))
    with pytest.raises(LlmError):
        await client.chat(0, [{"role": "user", "content": "hi"}])


@pytest.mark.parametrize("slot", [-1, 2, 99])
async def test_bad_slot_rejected(slot):
    client, seen = make_client(ok)
    with pytest.raises(ValueError):
        await client.chat(slot, [{"role": "user", "content": "hi"}])
    assert seen == []
