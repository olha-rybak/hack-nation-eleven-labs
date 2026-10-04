import fixture from '../../../server/tests/fixtures/workmap_invoices.json'
import type { WorkMap } from '../types/workmap'

// Server routes (T-203/T-105):
//   GET /api/sessions/:id/workmap         -> WorkMap JSON, 404 until the debrief finishes
//   GET /api/sessions/:id/frames/:ts.jpg  -> the saved frame, named by 10-digit ts (exists today)

const useMock = import.meta.env.VITE_MOCK === '1'

export class WorkMapNotFound extends Error {}

export async function fetchWorkMap(sessionId: string, signal?: AbortSignal): Promise<WorkMap> {
  if (useMock) return fixture as WorkMap

  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/workmap`, { signal })
  if (res.status === 404) throw new WorkMapNotFound(sessionId)
  if (!res.ok) throw new Error(`Loading the Work Map failed (${res.status})`)
  return (await res.json()) as WorkMap
}

// Mock frames are screenshots of the fake ERP, one per screen moment in the fixture.
const mockFrames = [
  ...new Set([...fixture.steps.map((s) => s.frame_ts), ...fixture.guardrails.map((g) => g.frame_ts)]),
].sort((a, b) => a - b)

export function frameUrl(sessionId: string, ts: number): string {
  // The session store names frames by zero-padded timestamp (store.save_frame).
  if (!useMock) return `/api/sessions/${encodeURIComponent(sessionId)}/frames/${String(ts).padStart(10, '0')}.jpg`
  const at = mockFrames.filter((f) => f <= ts).at(-1) ?? mockFrames[0]
  return `/mock-frames/${at}.jpg`
}
