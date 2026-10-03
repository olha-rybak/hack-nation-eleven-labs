// Live session data as the server sends it over /ws/session/:id.
// Mirrors apps/server/apprentice/capture/events.py (Event) and session/routes.py.

export type Speaker = 'expert' | 'agent'

export interface TranscriptLine {
  id: string
  speaker: Speaker
  text: string
  ts_ms: number
}

export type EventKind = 'open' | 'edit' | 'navigate' | 'save' | 'hold' | 'route' | 'unknown'

export interface ScreenEvent {
  id: string
  ts_ms: number
  kind: EventKind
  entity: string
  field: string | null
  before: string | null
  after: string | null
  confidence: number
  frame_ref: string
  fields?: Record<string, string> | null
  corrected?: boolean
}

export type EventCorrection = Partial<Pick<ScreenEvent, 'entity' | 'field' | 'before' | 'after'>>

/** The pause detector's cue that the apprentice may ask now, about one event. */
export interface AskCue {
  event_id: string
  subject: string
  question_index: number
  budget: number
  ts_ms: number
}

export interface OffRecordRemoved {
  from_ts: number
  until_ts: number
  frames: number
  events: number
  transcript: number
  event_ids: string[]
}
