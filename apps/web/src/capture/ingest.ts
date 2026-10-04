import { api } from '../lib/api'

// Server contract (apps/server/apprentice/capture/routes.py, session/routes.py):
//   POST /sessions {role}                         -> {session_id}
//   POST /ingest/frame?session_id&frame_ts        body = JPEG for a changed frame, empty when unchanged
//   POST /sessions/:id/end                        stops the live ask-now loop
// Paths are relative to the server root (lib/api.ts adds the base).

const useMock = import.meta.env.VITE_MOCK === '1'

export class ServerUnreachable extends Error {}

async function call(path: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(api(path), init)
  } catch {
    throw new ServerUnreachable(path)
  }
  if (res.status === 502 || res.status === 504) throw new ServerUnreachable(path)
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed (${res.status})`)
  return res
}

export async function createSession(): Promise<string> {
  if (useMock) return `local-${Date.now().toString(36)}`
  const res = await call('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'expert' }),
  })
  const body = (await res.json()) as { session_id: string }
  return body.session_id
}

export async function postFrame(sessionId: string, frameTs: number, jpeg: Blob | null): Promise<void> {
  if (useMock) return
  const query = new URLSearchParams({ session_id: sessionId, frame_ts: String(frameTs) })
  await call(`/ingest/frame?${query}`, {
    method: 'POST',
    headers: jpeg ? { 'Content-Type': 'image/jpeg' } : undefined,
    body: jpeg ?? undefined,
  })
}

export async function endSession(sessionId: string): Promise<void> {
  if (useMock) return
  await call(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST' })
}
