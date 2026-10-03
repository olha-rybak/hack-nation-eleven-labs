import base64

import httpx

from apprentice.settings import Settings, get_settings


class LlmError(Exception):
    """llama-server call failed or returned something unexpected."""


def _data_url(image: bytes) -> str:
    mime = "image/png" if image.startswith(b"\x89PNG") else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(image).decode()}"


def _attach_images(messages: list[dict], images: list[bytes]) -> list[dict]:
    messages = [dict(m) for m in messages]
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            parts = (
                [{"type": "text", "text": content}] if isinstance(content, str) else list(content)
            )
            parts += [{"type": "image_url", "image_url": {"url": _data_url(i)}} for i in images]
            m["content"] = parts
            return messages
    raise LlmError("images given but no user message to attach them to")


class LlmClient:
    def __init__(
        self,
        settings: Settings | None = None,
        client: httpx.AsyncClient | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.settings = settings or get_settings()
        self._client = client or httpx.AsyncClient(
            base_url=self.settings.LLAMA_SERVER_URL,
            timeout=self.settings.LLM_TIMEOUT_SEC,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def chat(
        self,
        slot: int,
        messages: list[dict],
        images: list[bytes] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
        timeout: float | None = None,
        extra: dict | None = None,
    ) -> str:
        if slot not in range(self.settings.LLM_SLOTS):
            raise ValueError(f"slot {slot} out of range (LLM_SLOTS={self.settings.LLM_SLOTS})")
        if images:
            messages = _attach_images(messages, images)
        body: dict = {"messages": messages, "id_slot": slot}
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature
        if extra:
            body.update(extra)  # llama-server extras, e.g. chat_template_kwargs, response_format
        kwargs = {} if timeout is None else {"timeout": timeout}
        try:
            resp = await self._client.post("/v1/chat/completions", json=body, **kwargs)
        except httpx.HTTPError as e:
            raise LlmError(f"cannot reach llama-server: {e!r}") from e
        if resp.status_code // 100 != 2:
            raise LlmError(f"llama-server returned {resp.status_code}: {resp.text[:200]}")
        try:
            return resp.json()["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as e:
            raise LlmError(f"malformed llama-server response: {resp.text[:200]}") from e

    async def ping(self) -> bool:
        try:
            await self.chat(
                0,
                [{"role": "user", "content": "ping"}],
                max_tokens=1,
                timeout=self.settings.LLM_HEALTH_TIMEOUT_SEC,
            )
        except Exception:
            return False
        return True
