from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    ELEVENLABS_INTERVIEWER_AGENT_ID: str = ""
    LLAMA_SERVER_URL: str = "http://127.0.0.1:8080"
    LLM_SLOTS: int = 1
    LLM_TIMEOUT_SEC: float = 60
    LLM_HEALTH_TIMEOUT_SEC: float = 5
    FRAME_FPS: float = 1
    PAUSE_SCREEN_STILL_SEC: float = 4
    PAUSE_SILENCE_SEC: float = 2
    ASK_COOLDOWN_SEC: float = 60
    MAX_LIVE_QUESTIONS: int = 5
    SESSIONS_DIR: str = "data/sessions"
    PAUSE_TICK_SEC: float = 0.25
    EVENT_MIN_CONFIDENCE: float = 0.6
    VISION_MAX_TOKENS: int = 512
    VISION_THINKING: bool = False
    ANTHROPIC_API_KEY: str = ""
    MAP_LLM_PROVIDER: Literal["anthropic", "local"] = "anthropic"
    MAP_LLM_MODEL: str = "claude-opus-5-5"
    MAP_LLM_EFFORT: Literal["low", "medium", "high", "xhigh", "max"] = "high"
    MAP_LLM_TIMEOUT_SEC: float = 300


@lru_cache
def get_settings() -> Settings:
    return Settings()
