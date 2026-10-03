import type { AskCue, OffRecordRemoved, ScreenEvent, Speaker, TranscriptLine } from '../types/session'

// Server protocol on /ws/session/:id (apps/server/apprentice/session/routes.py):
//   snapshot   {events, transcript}       once, on connect
//   event      ScreenEvent                new or corrected (same id replaces in place)
//   transcript {speaker, ts_ms, text}
//   ask_now    {subject, event_id, question_index, budget}
//   deleted    OffRecordRemoved           off the record: ts_ms >= from_ts_ms is gone from disk

export interface ServerLine {
  speaker: string
  ts_ms: number
  text: string
}

export type FeedMessage =
  | { type: 'snapshot'; data: { events: ScreenEvent[]; transcript: ServerLine[] } }
  | { type: 'event'; data: ScreenEvent }
  | { type: 'transcript'; data: ServerLine }
  | { type: 'ask_now'; data: Omit<AskCue, 'ts_ms'> }
  | { type: 'deleted'; data: OffRecordRemoved }

const AGENT_SPEAKERS = new Set(['agent', 'apprentice', 'interviewer', 'tutor'])

export function toLine(raw: ServerLine): TranscriptLine {
  const speaker: Speaker = AGENT_SPEAKERS.has(raw.speaker.toLowerCase()) ? 'agent' : 'expert'
  return { id: `${raw.ts_ms}-${raw.speaker}-${raw.text.length}`, speaker, ts_ms: raw.ts_ms, text: raw.text }
}

export interface FeedState {
  events: ScreenEvent[]
  transcript: TranscriptLine[]
  asks: AskCue[]
  /** Ids of items fading out after off the record, removed a moment later. */
  leaving: Set<string>
  lastRemoved: OffRecordRemoved | null
}

export const emptyFeed: FeedState = { events: [], transcript: [], asks: [], leaving: new Set(), lastRemoved: null }

export function lastTs(state: FeedState): number {
  const ev = state.events.at(-1)?.ts_ms ?? 0
  const line = state.transcript.at(-1)?.ts_ms ?? 0
  return Math.max(ev, line)
}

export function reduce(state: FeedState, msg: FeedMessage): FeedState {
  switch (msg.type) {
    case 'snapshot':
      return {
        ...emptyFeed,
        events: msg.data.events,
        transcript: msg.data.transcript.map(toLine),
      }
    case 'event': {
      const i = state.events.findIndex((e) => e.id === msg.data.id)
      const events = i === -1 ? [...state.events, msg.data] : state.events.map((e, j) => (j === i ? msg.data : e))
      return { ...state, events }
    }
    case 'transcript':
      return { ...state, transcript: [...state.transcript, toLine(msg.data)] }
    case 'ask_now': {
      const about = state.events.find((e) => e.id === msg.data.event_id)
      return { ...state, asks: [...state.asks, { ...msg.data, ts_ms: about?.ts_ms ?? lastTs(state) }] }
    }
    case 'deleted': {
      const r = msg.data
      const deleted = new Set(r.deleted_event_ids)
      const reverted = new Map(r.reverted_events.map((e) => [e.id, e]))
      const leaving = new Set(state.leaving)
      for (const e of state.events) if (deleted.has(e.id)) leaving.add(e.id)
      for (const l of state.transcript) if (l.ts_ms >= r.from_ts_ms) leaving.add(l.id)
      // A cue quotes the event as it was in the window, so it goes for reverted events too.
      for (const a of state.asks) if (deleted.has(a.event_id) || reverted.has(a.event_id)) leaving.add(`ask-${a.event_id}`)
      const events = state.events.map((e) => reverted.get(e.id) ?? e)
      return { ...state, events, leaving, lastRemoved: r }
    }
  }
}

/** Drops items that have finished fading out. */
export function sweep(state: FeedState): FeedState {
  if (state.leaving.size === 0) return state
  const gone = state.leaving
  return {
    ...state,
    events: state.events.filter((e) => !gone.has(e.id)),
    transcript: state.transcript.filter((l) => !gone.has(l.id)),
    asks: state.asks.filter((a) => !gone.has(`ask-${a.event_id}`)),
    leaving: new Set(),
  }
}
