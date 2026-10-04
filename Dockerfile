# Backend image (FastAPI). The web app is deployed separately (Vercel, apps/web/vercel.json).
# Build:  docker build -t apprentice-server .            (add --build-arg WITH_PRIVACY=1 for Presidio)
# Run:    docker run -p 8000:8000 -v apprentice-data:/data --env-file .env apprentice-server
FROM python:3.12-slim

ARG WITH_PRIVACY=0
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SESSIONS_DIR=/data/sessions \
    KNOWLEDGE_PATH=/data/knowledge/graph.json \
    ENVIRONMENT_CACHE_DIR=/data/environment \
    PRESIDIO_ENABLED=${WITH_PRIVACY}

WORKDIR /repo
# Editable install: the server finds config/ and its prompts relative to this source tree.
COPY apps/server/pyproject.toml apps/server/
COPY apps/server/apprentice apps/server/apprentice
RUN pip install --no-cache-dir -e ./apps/server
RUN if [ "$WITH_PRIVACY" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
      && rm -rf /var/lib/apt/lists/* \
      && pip install --no-cache-dir -e "./apps/server[privacy]" \
      && python -m spacy download en_core_web_lg; \
    fi

COPY config config
COPY apps/server/tests/fixtures/workmap_returns.json apps/server/tests/fixtures/
COPY apps/web/public/mock-frames apps/web/public/mock-frames
COPY scripts/seed_demo_session.py scripts/

# /data must be a persistent volume: sessions and Work Maps live there.
VOLUME /data
EXPOSE 8000
# The seed exits 1 when demo-brandt already exists (normal after the first start): carry on.
CMD python scripts/seed_demo_session.py; exec uvicorn apprentice.main:app --app-dir apps/server --host 0.0.0.0 --port ${PORT:-8000}
