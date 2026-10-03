import type { AskCue, OffRecordRemoved, ScreenEvent, Speaker, TranscriptLine } from '../types/session'

// Server protocol on /ws/session/:id (apps/server/apprentice/session/routes.py):
//   snapshot   {events, transcript}       once, on connect
//   event      ScreenEvent                new or corrected (same id replaces in place)
//   transcript {speaker, ts_ms, text}
//   ask_now    {subject, event_id, question_index, budget}
//   off_record OffRecordRemoved           everything in [from_ts, until_ts] was deleted

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
  | { type: 'off_record'; data: OffRecordRemoved }

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

const inWindow = (ts: number, r: OffRecordRemoved) => ts >= r.from_ts && ts <= r.until_ts

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
    case 'off_record': {
      const r = msg.data
      const leaving = new Set(state.leaving)
      for (const e of state.events) if (inWindow(e.ts_ms, r)) leaving.add(e.id)
      for (const l of state.transcript) if (inWindow(l.ts_ms, r)) leaving.add(l.id)
      for (const a of state.asks) if (r.event_ids.includes(a.event_id)) leaving.add(`ask-${a.event_id}`)
      return { ...state, leaving, lastRemoved: r }
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
