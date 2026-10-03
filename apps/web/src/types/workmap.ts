// Hand-mirrored from apps/server/apprentice/workmap/schema.py (T-200).
// Field names stay snake_case because this is the JSON wire format.
// Change both files in the same PR.

export type QuoteSource = 'live_question' | 'debrief' | 'narration'

export interface Quote {
  text: string
  speaker: string
  ts_ms: number
  source: QuoteSource
}

export type GuardrailKind = 'limit' | 'exception' | 'stop_and_ask' | 'never_do'

export interface GuardrailCheck {
  trigger_kind: string
  entity_pattern: string
  field: string
  condition: string
  severity: 'warn' | 'stop'
}

export interface Step {
  index: number // 1-based, unique within a map
  title: string
  frame_ts: number // ms since session start
  frame_ref: string
  decision: string
  reason: Quote
  guardrail_ids: string[]
  is_judgment_call: boolean
}

export interface Guardrail {
  id: string
  kind: GuardrailKind
  statement: string
  frame_ts: number
  reason: Quote
  step_index: number
  check: GuardrailCheck | null
}

export interface WorkMap {
  id: string
  session_id: string
  title: string
  created_at: string
  confirmed_at: string | null
  steps: Step[]
  guardrails: Guardrail[]
  open_questions: string[]
}
