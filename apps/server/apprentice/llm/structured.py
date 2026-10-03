"""Structured-output LLM calls for the Work Map builder and debrief.

MAP_LLM_PROVIDER picks the backend: "anthropic" (Claude, the default) or "local" (the llama-server
already running for vision, through its OpenAI-compatible endpoint; free, for wiring tests). The
schema is a pydantic model; the reply comes back validated.
"""

from typing import Protocol, TypeVar

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from pydantic import BaseModel

from apprentice.settings import Settings

T = TypeVar("T", bound=BaseModel)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class StructuredLlmError(Exception):
    """The model refused, ran out of tokens, or returned nothing parseable."""


class StructuredLlm(Protocol):
    async def parse(self, system: str, user: str, schema: type[T]) -> T: ...

    async def aclose(self) -> None: ...


class ClaudeLlm:
    def __init__(self, settings: Settings, client: AsyncAnthropic | None = None):
        self.model = settings.MAP_LLM_MODEL
        self.effort = settings.MAP_LLM_EFFORT
        self.client = client or AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY or None, timeout=settings.MAP_LLM_TIMEOUT_SEC
        )

    async def parse(self, system: str, user: str, schema: type[T]) -> T:
        response = await self.client.beta.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,
            output_config={"effort": self.effort},
            betas=[FALLBACK_BETA],
            fallbacks="default",  # a refused request is re-run server-side on another model
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            raise StructuredLlmError(f"stopped: {response.stop_reason}")
        if response.parsed_output is None:
            raise StructuredLlmError("no parseable output")
        return response.parsed_output

    async def aclose(self) -> None:
        await self.client.close()


class LocalLlm:
    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None):
        self.client = client or AsyncOpenAI(
            api_key="unused",
            base_url=settings.LLAMA_SERVER_URL.rstrip("/") + "/v1",
            timeout=settings.MAP_LLM_TIMEOUT_SEC,
        )

    async def parse(self, system: str, user: str, schema: type[T]) -> T:
        completion = await self.client.chat.completions.parse(
            model="local",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format=schema,
        )
        message = completion.choices[0].message
        if message.refusal or message.parsed is None:
            raise StructuredLlmError(message.refusal or "no parseable output")
        return message.parsed

    async def aclose(self) -> None:
        await self.client.close()


def structured_llm(settings: Settings) -> StructuredLlm:
    if settings.MAP_LLM_PROVIDER == "local":
        return LocalLlm(settings)
    return ClaudeLlm(settings)
