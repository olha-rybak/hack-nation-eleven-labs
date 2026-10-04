// Hand-mirrored from apps/server/apprentice/workmap/draft.py (T-201).
// Change both files in the same PR.

import type { GuardrailCheck, GuardrailKind, Quote } from './workmap'

export type GapKind = 'no_reason' | 'no_threshold' | 'unseen_branch' | 'inconsistency'
export type GapStatus = 'open' | 'answered' | 'declined'

export interface DraftStep {
  index: number
  title: string
  frame_ts: number
  frame_ref: string
  decision: string
  reason: Quote | null // null = not explained yet
  guardrail_ids: string[]
  is_judgment_call: boolean
  event_ids: string[]
}

export interface DraftGuardrail {
  id: string
  kind: GuardrailKind
  statement: string
  frame_ts: number
  reason: Quote | null
  step_index: number
  check: GuardrailCheck | null
}

export interface Gap {
  id: string
  kind: GapKind
  step_index: number | null
  guardrail_id: string | null
  question: string // one spoken sentence the debrief can ask as is
  why_it_matters: string
  importance: number // 1-5
  status: GapStatus
  answer: Quote | null // the expert's debrief answer, once answered
}

/** GET /sessions/:id/debrief */
export interface DebriefStatus {
  next: Gap | null
  queue: Gap[] // every gap still to ask, in asking order
  left: number
  done: boolean
  guardrail_needed: boolean
}

export interface DraftWorkMap {
  id: string
  session_id: string
  title: string
  created_at: string
  steps: DraftStep[]
  guardrails: DraftGuardrail[]
  gaps: Gap[] // ranked, most important first
}
