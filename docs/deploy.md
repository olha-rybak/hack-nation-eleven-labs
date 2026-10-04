# Deploy

Two parts, hosted separately:

- **Web app** (`apps/web`, static Vite build) on **Vercel**.
- **Server** (`apps/server`, FastAPI) on a **container host** with a persistent volume (Render,
  Railway, Fly). It cannot run on Vercel: it keeps WebSockets open, runs background loops (pause
  detector, vision) and writes sessions to disk.

The browser talks to the server directly (`VITE_API_BASE`), not through a Vercel rewrite, so slow
calls like building the draft Work Map are not cut off by a proxy timeout.

## Server (container)

The root `Dockerfile` builds it; `.dockerignore` keeps the image to what it needs.

```bash
docker build -t apprentice-server .                          # without Presidio (smaller)
docker build -t apprentice-server --build-arg WITH_PRIVACY=1 .   # with Presidio + Tesseract
docker run -p 8000:8000 -v apprentice-data:/data --env-file .env apprentice-server
```

- Listens on `$PORT` (default 8000). Health check: `GET /health`.
- **Mount a persistent volume at `/data`.** Sessions, Work Maps and the knowledge graph live there;
  without a volume every restart or redeploy deletes them.
- On first start it seeds the example session `demo-brandt` (returns-desk Work Map with
  screenshots, `scripts/seed_demo_session.py`). It never touches a session that already exists.

Environment (set as secrets on the host; see `.env.example` for the rest):

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Required: draft Work Map, rules, brief, vision |
| `VISION_PROVIDER` | `anthropic` (there is no local model on the host) |
| `ELEVENLABS_INTERVIEWER_AGENT_ID`, `ELEVENLABS_DEBRIEF_AGENT_ID`, `ELEVENLABS_TUTOR_AGENT_ID` | The three agents; each must allow public access in the ElevenLabs dashboard |
| `CORS_ORIGINS` | The Vercel URL, e.g. `https://apprentice.vercel.app` (default `*`) |
| `PRESIDIO_ENABLED` | Set by the image: on with `WITH_PRIVACY=1`, off otherwise |

## Web app (Vercel)

Import the GitHub repo in Vercel and set:

- **Root Directory:** `apps/web` (keep "Include files outside the root directory" on; the build reads
  a fixture from `apps/server/tests/fixtures`).
- **Environment variable:** `VITE_API_BASE` = the server's public URL, e.g.
  `https://apprentice-server.onrender.com` (no trailing slash). It is baked in at build time, so
  redeploy after changing it.

`apps/web/vercel.json` sets the Vite build and sends every route to `index.html`, so links like
`/vault/<id>` work on reload. Vercel serves HTTPS, which screen sharing and the microphone require.

## Costs

Anyone with the link can run sessions on the team's Anthropic and ElevenLabs accounts. Set a spending
limit in the Anthropic console and usage limits on the ElevenLabs agents before sharing the URL.
