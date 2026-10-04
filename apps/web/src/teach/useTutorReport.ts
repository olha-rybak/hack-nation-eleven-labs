import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { TutorReport } from './TutorPresentation'

// GET /sessions/:id/report?workmap_session=<expert session> (T-303): built on the server by
// replaying the session's events against the confirmed Work Map. The UI never builds one itself.
interface ProgressReport {
  mastered: string[]
  missed: string[]
  guardrails: { statement: string; resolution: string }[]
  practice_next: string[]
}

export function toTutorReport(r: ProgressReport): TutorReport {
  return {
    mastered: r.mastered,
    missed: r.missed,
    guardrails: r.guardrails.map((g) => ({ statement: g.statement, resolution: g.resolution })),
    practiceNext: r.practice_next,
  }
}

export function useTutorReport(sessionId: string | null, workMapId: string) {
  const [result, setResult] = useState<{ id: string; report: TutorReport | null } | null>(null)
  useEffect(() => {
    if (!sessionId) return
    const query = new URLSearchParams({ workmap_session: workMapId })
    let current = true
    fetch(api(`/sessions/${encodeURIComponent(sessionId)}/report?${query}`))
      .then((res) => (res.ok ? (res.json() as Promise<ProgressReport>) : null))
      .then((body) => current && setResult({ id: sessionId, report: body ? toTutorReport(body) : null }))
      .catch(() => current && setResult({ id: sessionId, report: null }))
    return () => {
      current = false
    }
  }, [sessionId, workMapId])
  if (!sessionId) return { status: 'idle' as const, report: null }
  if (result?.id !== sessionId) return { status: 'loading' as const, report: null }
  return { status: result.report ? ('ready' as const) : ('unavailable' as const), report: result.report }
}
