import type { DraftWorkMap } from '../types/draft'

// Server routes (T-201, docs/workmap-builder.md):
//   GET  /api/sessions/:id/workmap/draft -> the saved draft, 404 until one is built
//   POST /api/sessions/:id/workmap/draft -> build it from the session log (~10 s), 502 if the LLM fails

function path(sessionId: string) {
  return `/api/sessions/${encodeURIComponent(sessionId)}/workmap/draft`
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
