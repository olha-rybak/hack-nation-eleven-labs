import type { ScreenEvent } from '../types/session'
import type { Quote, WorkMap } from '../types/workmap'

// What the tutor agent (T-302) is told, as text. The formats match prompts/tutor/system.md.

/** `guardrail_hit` from the session websocket (docs/api.md, T-300). */
export interface GuardrailHit {
  guardrail_id: string
  severity: 'warn' | 'stop'
  statement: string
  reason: Quote
  entity: string
  event_id: string | null
  frame_refs: string[]
  source_session_id: string
  timing: string
  ts_ms: number | null
  known?: { id: string; text: string }[]
}

export interface GuardrailResolved {
  guardrail_id: string
  entity: string
  event_id: string | null
  ts_ms: number | null
}

export const hitKey = (h: { guardrail_id: string; entity: string }) => `${h.guardrail_id}|${h.entity}`

/** The expert's screen moment for a hit: the guardrail's own frame, else the first frame ref. */
export function hitFrameTs(hit: GuardrailHit, map: WorkMap): number | null {
  const rule = map.guardrails.find((g) => g.id === hit.guardrail_id)
  if (rule) return rule.frame_ts
  const m = hit.frame_refs[0]?.match(/(\d+)\.jpg$/)
  return m ? Number(m[1]) : null
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function eventLine(e: ScreenEvent): string {
  let line = `[${clock(e.ts_ms)}] ${e.kind} ${e.entity}`
  if (e.field) {
    line += ` · ${e.field}`
    if (e.before != null || e.after != null) line += `: ${e.before || '—'} → ${e.after || '—'}`
  }
  return line
}

const said = (q: Quote) => `"${q.text}" (${q.speaker})`

function knownLines(known?: { text: string }[]): string {
  return known?.length ? `\nKnown:\n${known.map((k) => `- ${k.text}`).join('\n')}` : ''
}

/** Sent once at the start as background context: the expert's map, quotes verbatim. */
export function workMapBrief(map: WorkMap): string {
  const steps = [...map.steps]
    .sort((a, b) => a.index - b.index)
    .map((s) => `${s.index}. ${s.title}. Decision: ${s.decision}. Expert: ${said(s.reason)}`)
  const rules = map.guardrails.map((g) => `${g.id}: ${g.statement} Expert: ${said(g.reason)}`)
  return [`WORK MAP: ${map.title}`, 'Steps:', ...steps, 'Guardrails:', ...rules].join('\n')
}

export function hitCue(hit: GuardrailHit): string {
  return `${hit.severity === 'stop' ? 'STOP' : 'WARN'}\nOn: ${hit.entity}\nGuardrail: ${hit.statement}\nExpert: ${said(hit.reason)}${knownLines(hit.known)}`
}

export function resolvedCue(hit: GuardrailHit): string {
  return `RESOLVED\nGuardrail: ${hit.statement}`
}

export function caseOpenedCue(entity: string): string {
  return `CASE_OPENED\nCase: ${entity}`
}

export function pauseCue(ask: { subject: string; known?: { text: string }[] }): string {
  return `PAUSE\nSubject: ${ask.subject}${knownLines(ask.known)}`
}

// Client tools: the agent asks for the exact wording instead of paraphrasing from memory.
export function lookupGuardrail(map: WorkMap, id: string): string {
  const g = map.guardrails.find((x) => x.id === id)
  return g ? `${g.statement} Expert: ${said(g.reason)}` : `No guardrail ${id} in the Work Map.`
}

export function lookupStep(map: WorkMap, index: number): string {
  const s = map.steps.find((x) => x.index === index)
  return s ? `${s.index}. ${s.title}. Decision: ${s.decision}. Expert: ${said(s.reason)}` : `No step ${index} in the Work Map.`
}
