import type { DebriefStatus, DraftWorkMap } from '../types/draft'
import type { Speaker, TranscriptLine } from '../types/session'
import type { WorkMap } from '../types/workmap'
import { api } from '../lib/api'
import type { WorkMapChange } from './teachback'

// Server routes (T-201, docs/workmap-builder.md):
//   GET  /api/sessions/:id/workmap/draft -> the saved draft, 404 until one is built
//   POST /api/sessions/:id/workmap/draft -> build it from the session log (~10 s), 502 if the LLM fails
//   GET  /api/sessions/:id/debrief       -> the gaps still to ask, in order, and whether it is done
//   POST /api/sessions/:id/debrief/finish -> save the Work Map from what was explained, 409 if nothing was
//   GET/POST /api/sessions/:id/debrief/transcript -> what was said in the debrief, apart from capture
//   POST /api/sessions/:id/workmap/teachback -> the apprentice's explanation of the process (T-204)
//   POST /api/sessions/:id/workmap/correct   -> the expert's correction applied to the Work Map
//   POST /api/sessions/:id/workmap/confirm   -> stamp confirmed_at and freeze the Work Map

function session(sessionId: string) {
  return api(`/sessions/${encodeURIComponent(sessionId)}`)
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

/** Null when nothing was explained (409): the debrief closes without a Work Map. */
export async function finishDebrief(sessionId: string): Promise<{ workmap: WorkMap; left_out: string[] } | null> {
  const res = await fetch(`${session(sessionId)}/debrief/finish`, { method: 'POST' })
  if (res.status === 409) return null
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

/** What was said in the debrief so far; empty if it has not started or the server is down. */
export async function fetchDebriefTranscript(sessionId: string, signal?: AbortSignal): Promise<TranscriptLine[]> {
  const res = await fetch(`${session(sessionId)}/debrief/transcript`, { signal }).catch(() => null)
  if (!res?.ok) return []
  const lines = (await res.json()) as Omit<TranscriptLine, 'id'>[]
  return lines.map((l, i) => ({ ...l, id: `debrief-${i}` }))
}

export async function postDebriefLine(sessionId: string, line: { speaker: Speaker; text: string; ts_ms: number }): Promise<void> {
  const res = await fetch(`${session(sessionId)}/debrief/transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(line),
  })
  if (!res.ok) throw new Error(`Saving the debrief line failed (${await detail(res)})`)
}

export async function fetchTeachBack(sessionId: string): Promise<string> {
  const res = await fetch(`${session(sessionId)}/workmap/teachback`, { method: 'POST' })
  if (!res.ok) throw new Error(`Preparing the teach-back failed (${await detail(res)})`)
  return ((await res.json()) as { text: string }).text
}

export async function correctWorkMap(sessionId: string, text: string): Promise<WorkMapChange[]> {
  const res = await fetch(`${session(sessionId)}/workmap/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`Applying the correction failed (${await detail(res)})`)
  return ((await res.json()) as { changes: WorkMapChange[] }).changes
}

export async function confirmTeachBack(sessionId: string): Promise<void> {
  const res = await fetch(`${session(sessionId)}/workmap/confirm`, { method: 'POST' })
  if (!res.ok) throw new Error(`Confirming the Work Map failed (${await detail(res)})`)
}
