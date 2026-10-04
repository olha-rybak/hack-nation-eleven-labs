from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    ELEVENLABS_INTERVIEWER_AGENT_ID: str = ""
    ELEVENLABS_DEBRIEF_AGENT_ID: str = ""  # empty: the interviewer agent, prompt sent as override
    ELEVENLABS_TUTOR_AGENT_ID: str = ""
    LLAMA_SERVER_URL: str = "http://127.0.0.1:8080"
    LLM_SLOTS: int = 1
    LLM_TIMEOUT_SEC: float = 60
    LLM_HEALTH_TIMEOUT_SEC: float = 5
    FRAME_FPS: float = 1
    PAUSE_SCREEN_STILL_SEC: float = 4
    PAUSE_SILENCE_SEC: float = 2
    ASK_COOLDOWN_SEC: float = 60
    MAX_LIVE_QUESTIONS: int = 5
    DEBRIEF_MIN_IMPORTANCE: int = 3
    GUARDRAIL_BY_QUESTION: int = 4
    SESSIONS_DIR: str = "data/sessions"
    KNOWLEDGE_PATH: str = "data/knowledge/graph.json"
    ENVIRONMENT_DIR: str = "config/environment"
    ENVIRONMENT_CACHE_DIR: str = "data/environment"
    KNOWN_MAX_FACTS: int = 10
    KNOWN_MAX_CHARS: int = 2000
    PAUSE_TICK_SEC: float = 0.25
    OFF_THE_RECORD_WINDOW_SEC: float = 30
    EVENT_MIN_CONFIDENCE: float = 0.6
    VISION_MAX_TOKENS: int = 512
    VISION_THINKING: bool = False
    VISION_PROVIDER: Literal["anthropic", "local"] = "anthropic"
    VISION_MODEL: str = "claude-haiku-4-5"
    VISION_EFFORT: Literal["low", "medium", "high", "xhigh", "max"] = "low"
    ANTHROPIC_API_KEY: str = ""
    MAP_LLM_PROVIDER: Literal["anthropic", "local"] = "anthropic"
    MAP_LLM_MODEL: str = "claude-opus-5-5"
    MAP_LLM_EFFORT: Literal["low", "medium", "high", "xhigh", "max"] = "high"
    MAP_LLM_TIMEOUT_SEC: float = 300
    PRESIDIO_ENABLED: bool = True
    PRESIDIO_SPACY_MODEL: str = "en_core_web_lg"
    PRESIDIO_ENTITIES: str = "PERSON,EMAIL_ADDRESS,IBAN_CODE,PHONE_NUMBER,LOCATION"
    PRESIDIO_SCORE_THRESHOLD: float = 0.4
    PRESIDIO_PHONE_REGIONS: str = "AT,DE,CZ,GB,US"
    TESSERACT_CMD: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
