"""Structured-output LLM calls for the Work Map builder and debrief.

One OpenAI-compatible client: OpenAI itself, or the local llama-server (Qwen) by pointing
MAP_LLM_BASE_URL at it. The schema is a pydantic model; the reply comes back validated.
"""

from typing import TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel

from apprentice.settings import Settings

T = TypeVar("T", bound=BaseModel)


class StructuredLlmError(Exception):
    """The model refused or returned nothing parseable."""


class StructuredLlm:
    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None):
        self.model = settings.MAP_LLM_MODEL
        self.client = client or AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY or "unused-for-local",
            base_url=settings.MAP_LLM_BASE_URL or None,
            timeout=settings.MAP_LLM_TIMEOUT_SEC,
        )

    async def parse(self, system: str, user: str, schema: type[T]) -> T:
        completion = await self.client.chat.completions.parse(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format=schema,
        )
        message = completion.choices[0].message
        if message.refusal or message.parsed is None:
            raise StructuredLlmError(message.refusal or "no parseable output")
        return message.parsed

    async def aclose(self) -> None:
        await self.client.close()
