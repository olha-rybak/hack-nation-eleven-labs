import fixture from '../../../server/tests/fixtures/workmap_invoices.json'
import type { WorkMap } from '../types/workmap'

// Proposed server routes (lane B, T-201/T-105):
//   GET /api/sessions/:id/workmap         -> WorkMap JSON, 404 until the debrief produced one
//   GET /api/sessions/:id/frames/:ts.jpg  -> the saved frame at or just before ts (ms)

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
  if (!useMock) return `/api/sessions/${encodeURIComponent(sessionId)}/frames/${ts}.jpg`
  const at = mockFrames.filter((f) => f <= ts).at(-1) ?? mockFrames[0]
  return `/mock-frames/${at}.jpg`
}
