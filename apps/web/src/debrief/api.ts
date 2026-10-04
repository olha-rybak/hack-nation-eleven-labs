import type { DebriefStatus, DraftWorkMap } from '../types/draft'
import type { WorkMap } from '../types/workmap'

// Server routes (T-201, docs/workmap-builder.md):
//   GET  /api/sessions/:id/workmap/draft -> the saved draft, 404 until one is built
//   POST /api/sessions/:id/workmap/draft -> build it from the session log (~10 s), 502 if the LLM fails
//   GET  /api/sessions/:id/debrief       -> the gaps still to ask, in order, and whether it is done
//   POST /api/sessions/:id/debrief/finish -> save the Work Map from what was explained, 409 if nothing was

function session(sessionId: string) {
  return `/api/sessions/${encodeURIComponent(sessionId)}`
}

function path(sessionId: string) {
  return `${session(sessionId)}/workmap/draft`
}

async function detail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // not JSON: fall through to the status
  }
  return `status ${res.status}`
}

/** The saved draft, or null if End task has not built one yet. */
export async function fetchDraft(sessionId: string, signal?: AbortSignal): Promise<DraftWorkMap | null> {
  const res = await fetch(path(sessionId), { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Loading the draft failed (${await detail(res)})`)
  return (await res.json()) as DraftWorkMap
}

export async function buildDraft(sessionId: string, signal?: AbortSignal): Promise<DraftWorkMap> {
  const res = await fetch(path(sessionId), { method: 'POST', signal })
  if (!res.ok) throw new Error(`Building the draft failed (${await detail(res)})`)
  return (await res.json()) as DraftWorkMap
}

export async function fetchDebrief(sessionId: string, signal?: AbortSignal): Promise<DebriefStatus> {
  const res = await fetch(`${session(sessionId)}/debrief`, { signal })
  if (!res.ok) throw new Error(`Loading the debrief failed (${await detail(res)})`)
  return (await res.json()) as DebriefStatus
}

export async function finishDebrief(sessionId: string): Promise<{ workmap: WorkMap; left_out: string[] }> {
  const res = await fetch(`${session(sessionId)}/debrief/finish`, { method: 'POST' })
  if (!res.ok) throw new Error(`Finishing the debrief failed (${await detail(res)})`)
  return (await res.json()) as { workmap: WorkMap; left_out: string[] }
}

export type DebriefAnswerBody = { gap_id: string; text: string; ts_ms: number } | { gap_id: string; declined: true }

/** 409 (already closed) is not an error here: the gap is closed either way. */
export async function answerGap(sessionId: string, body: DebriefAnswerBody): Promise<void> {
  const res = await fetch(`${session(sessionId)}/debrief/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 409) throw new Error(`Saving the answer failed (${await detail(res)})`)
}
