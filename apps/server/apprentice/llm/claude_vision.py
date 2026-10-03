"""Vision on Claude instead of llama-server (VISION_PROVIDER=anthropic).

Same `chat`/`ping`/`aclose` surface as LlmClient, so VisionService does not care which one it has.
llama-server extras (`extra`, `temperature`, slots) have no Claude equivalent and are ignored.
"""

import base64

import anthropic
from anthropic import AsyncAnthropic

from apprentice.llm.client import LlmError
from apprentice.settings import Settings

FALLBACK_BETA = "server-side-fallback-2026-07-01"


def _image_block(image: bytes) -> dict:
    mime = "image/png" if image.startswith(b"\x89PNG") else "image/jpeg"
    data = base64.standard_b64encode(image).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}}


def _with_images(messages: list[dict], images: list[bytes]) -> list[dict]:
    messages = [dict(m) for m in messages]
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            text = [{"type": "text", "text": content}] if isinstance(content, str) else content
            m["content"] = [_image_block(i) for i in images] + list(text)
            return messages
    raise LlmError("images given but no user message to attach them to")


class ClaudeVisionClient:
    def __init__(self, settings: Settings, client: AsyncAnthropic | None = None):
        self.model = settings.VISION_MODEL
        self.effort = settings.VISION_EFFORT
        self.health_timeout = settings.LLM_HEALTH_TIMEOUT_SEC
        self.client = client or AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY or None, timeout=settings.LLM_TIMEOUT_SEC
        )

    @property
    def _haiku(self) -> bool:
        return self.model.startswith("claude-haiku")  # no effort, no server-side fallback

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
        if images:
            messages = _with_images(messages, images)
        kwargs: dict = {}
        if not self._haiku:
            kwargs = {
                "output_config": {"effort": self.effort},
                "betas": [FALLBACK_BETA],
                "fallbacks": "default",
            }
        client = self.client if timeout is None else self.client.with_options(timeout=timeout)
        try:
            response = await client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens or 4096,
                messages=messages,
                **kwargs,
            )
        except anthropic.APIError as e:
            raise LlmError(f"Claude vision call failed: {e!r}") from e
        if response.stop_reason == "refusal":
            raise LlmError("Claude refused the vision request")
        return "".join(b.text for b in response.content if b.type == "text")

    async def ping(self) -> bool:
        try:
            await self.client.with_options(timeout=self.health_timeout).models.retrieve(self.model)
        except anthropic.APIError:
            return False
        return True

    async def aclose(self) -> None:
        await self.client.close()
