# T-002 · Frontend scaffold
**Lane A · depends on: —**

`apps/web` as Vite + React + TS. Routes: `/capture`, `/map/:sessionId`, `/teach/:workMapId`, `/erp`.
Dev-server proxy `/api` → `http://127.0.0.1:8000`. Shared types in `apps/web/src/types/` hand-mirrored
against the Work Map schema. Minimal layout shell: main stage + right side panel.

**Acceptance:** `npm run dev` serves all four routes; `npm run build && npm run typecheck` clean;
side panel renders a placeholder transcript list fed by a mocked websocket.

**Note:** keep the mock switchable by env (`VITE_MOCK=1`) rather than deleting it later. If the backend or
the model is down on demo day, the UI still runs on recorded data.
