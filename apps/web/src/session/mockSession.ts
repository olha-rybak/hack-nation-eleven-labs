import type { EventCorrection, OffRecordRemoved, ScreenEvent } from '../types/session'
import type { FeedMessage, ServerLine } from './feed'

// Plays Sabine's first two invoices so the panel works without a backend (VITE_MOCK=1).
// Timestamps are real elapsed time since the feed opened, so off the record behaves like
// the server does.

type Step =
  | { event: Omit<ScreenEvent, 'id' | 'ts_ms' | 'frame_ref' | 'confidence'> & { confidence?: number } }
  | { line: Omit<ServerLine, 'ts_ms'> }
  | { ask: string; index: number }

const script: Step[] = [
  { event: { kind: 'open', entity: 'INV-4471', field: null, before: null, after: null } },
  { line: { speaker: 'expert', text: 'Okay, first the Weber invoice. That one is due before close.' } },
  { event: { kind: 'edit', entity: 'INV-4471', field: 'cost center', before: '4711', after: '0400' } },
  { ask: 'cost center', index: 1 },
  { line: { speaker: 'apprentice', text: 'You moved that one to capex. What made you do that?' } },
  { line: { speaker: 'expert', text: 'Equipment over five thousand euros is always capex.' } },
  { event: { kind: 'edit', entity: 'INV-4471', field: 'asset number', before: null, after: 'AN-20931' } },
  { event: { kind: 'save', entity: 'INV-4471', field: null, before: null, after: 'posted' } },
  { event: { kind: 'open', entity: 'INV-4472', field: null, before: null, after: null } },
  { event: { kind: 'hold', entity: 'INV-4472', field: 'status', before: 'Open', after: 'On hold', confidence: 0.68 } },
  { ask: 'status', index: 2 },
  { line: { speaker: 'apprentice', text: 'You put the Nordtec invoice on hold. Who decides when it gets released?' } },
  { line: { speaker: 'expert', text: 'I do, once purchasing confirms it is not a duplicate.' } },
]

const STEP_MS = 2500
const BUDGET = Number(import.meta.env.VITE_MAX_LIVE_QUESTIONS) || 5

export interface MockSession {
  close(): void
  correct(id: string, patch: EventCorrection): ScreenEvent | null
  offRecord(untilTs: number, windowMs: number): OffRecordRemoved
}

export function openMockSession(emit: (msg: FeedMessage) => void): MockSession {
  const opened = performance.now()
  const now = () => Math.round(performance.now() - opened)
  const events: ScreenEvent[] = []
  let index = 0
  let n = 0

  emit({ type: 'snapshot', data: { events: [], transcript: [] } })
  const timer = setInterval(() => {
    const step = script[index++]
    if (!step) return clearInterval(timer)
    const ts = now()
    if ('event' in step) {
      const ev: ScreenEvent = { confidence: 0.92, ...step.event, id: `mock-${++n}`, ts_ms: ts, frame_ref: '' }
      events.push(ev)
      emit({ type: 'event', data: ev })
    } else if ('line' in step) {
      emit({ type: 'transcript', data: { ...step.line, ts_ms: ts } })
    } else {
      const about = [...events].reverse().find((e) => e.field === step.ask)
      if (about) emit({ type: 'ask_now', data: { subject: step.ask, event_id: about.id, question_index: step.index, budget: BUDGET } })
    }
  }, STEP_MS)

  return {
    close: () => clearInterval(timer),
    correct(id, patch) {
      const i = events.findIndex((e) => e.id === id)
      if (i === -1) return null
      events[i] = { ...events[i], ...patch, corrected: true }
      emit({ type: 'event', data: events[i] })
      return events[i]
    },
    offRecord(untilTs, windowMs) {
      const from = Math.max(0, untilTs - windowMs)
      const gone = events.filter((e) => e.ts_ms >= from && e.ts_ms <= untilTs)
      for (const e of gone) events.splice(events.indexOf(e), 1)
      const removed: OffRecordRemoved = {
        from_ts: from,
        until_ts: untilTs,
        frames: 0,
        events: gone.length,
        transcript: 0,
        event_ids: gone.map((e) => e.id),
      }
      emit({ type: 'off_record', data: removed })
      return removed
    },
  }
}
