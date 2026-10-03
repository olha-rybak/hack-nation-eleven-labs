# T-001 · Backend scaffold + llama-server bring-up
**Lane B · owner: Hlib · depends on: —**

Stand up `apps/server` as a FastAPI app (`apprentice.main:app`) with `uv`/pyproject, ruff, pytest.
Get Nemotron Omni running in `llama-server --parallel 2` and wrap it in a thin client
(`apprentice/llm/client.py`) that takes a slot index, messages and optional images, and returns text.
Add `GET /health` reporting both the server and whether the model answers.

Settings come from `.env` via pydantic-settings — mirror `.env.example` exactly.

**Acceptance:** `uv run pytest` passes; `curl localhost:8000/health` reports `model: ok`; a one-off
script sends two screenshots to slot 0 and prints a text diff of what changed.
