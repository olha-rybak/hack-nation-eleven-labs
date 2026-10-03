# apps/web

Capture UI, Work Map timeline, tutor overlay and the fake ERP. Vite + React + TypeScript.

Needs Node 20.19+ or 22.12+ (`.nvmrc` says 22).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to http://127.0.0.1:8000
npm run build
npm run typecheck
npm run lint
```

| Route | What |
|---|---|
| `/capture` | Expert shares their screen, apprentice asks why (T-101, T-102) |
| `/map/:sessionId` | Work Map timeline and debrief (T-202) |
| `/teach/:workMapId` | Tutor overlay for the new hire (T-301) |
| `/erp` | Fake ERP the expert shares, with INV-4471/4472/4473. Imports nothing from the apprentice side (T-100) |
| `/erp?case=training` | Same ERP for the new hire, with the unseen case INV-4474 (T-303) |

`.env.development` sets `VITE_MOCK=1`, so the side panel plays a scripted conversation without a
backend. Set it to `0` in `.env.development.local` to use the real websocket at
`/api/sessions/:id/feed`.

`src/types/workmap.ts` mirrors `apps/server/apprentice/workmap/schema.py` (T-200). Change both together.

The ERP keeps its state in `localStorage`, separately for the expert and training data. **Reset sandbox**
in its header restores the seed data between rehearsals. The judgment calls are hidden in the data
(`src/erp/data.ts`), never in UI text.
