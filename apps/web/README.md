# apps/web

Capture UI, Work Map timeline, tutor overlay and the fake ERP. Vite + React + TypeScript.

Needs Node 20.19+ or 22.12+ (`.nvmrc` says 22).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api/* to the server root
npm test           # unit tests (vitest)
npm run build
npm run typecheck
npm run lint
```

| Route | What |
|---|---|
| `/capture` | Expert shares their screen, apprentice asks why (T-101, T-102) |
| `/debrief/:sessionId` | Debrief: builds the draft on End task, lists the gaps (T-203) |
| `/rules/:sessionId` | Rule review after the debrief (T-205) |
| `/vault/:sessionId` | The Work Map as an Obsidian-style vault: notes, graph, export (T-600). `/map/:id` redirects here |
| `/teach/:workMapId` | Tutor overlay for the new hire (T-301) |
| `/shop` | Returns desk the expert shares, with RMA-1041..1045. Imports nothing from the apprentice side |
| `/shop?case=training` | Same desk for the new hire, with the unseen case RMA-2051 (T-303) |

`.env.development` sets `VITE_MOCK=1`: no backend needed, the side panel plays a scripted
conversation and capture counts frames locally without uploading. To use the real server, create
`.env.development.local` with `VITE_MOCK=0` (and `VITE_API_TARGET=http://127.0.0.1:8001` if the
server runs on 8001). The proxy strips `/api`, so `/api/ingest/frame` reaches `/ingest/frame`.

Capture (`src/capture/`) reads `FRAME_FPS` and `FRAME_CHANGE_MIN_CELLS` from the repo-root `.env`.
Share the returns desk tab, not this one: the browser's picker hides the capture tab itself.

With `VITE_MOCK=1` the Vault (`/vault/demo`) shows the returns fixture
(`apps/server/tests/fixtures/workmap_returns.json`), and its screen moments come from
`public/mock-frames/<ts>.jpg`: screenshots of the returns desk in the state each step describes.

`src/types/workmap.ts` mirrors `apps/server/apprentice/workmap/schema.py` (T-200). Change both together.

The ERP keeps its state in `localStorage`, separately for the expert and training data. **Reset sandbox**
in its header restores the seed data between rehearsals. The judgment calls are hidden in the data
(`src/erp/data.ts`), never in UI text.
