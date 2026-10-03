import { describe, expect, it } from 'vitest'
import type { ScreenEvent } from '../types/session'
import { emptyFeed, reduce, sweep, type FeedState } from './feed'

const ev = (id: string, ts: number, after = '0400'): ScreenEvent => ({
  id,
  ts_ms: ts,
  kind: 'edit',
  entity: 'INV-4471',
  field: 'cost center',
  before: '4711',
  after,
  confidence: 0.9,
  frame_ref: `frames/${ts}.jpg`,
})

function feed(...events: ScreenEvent[]): FeedState {
  return reduce(emptyFeed, {
    type: 'snapshot',
    data: { events, transcript: [{ speaker: 'interviewer', ts_ms: 9_000, text: 'Why capex?' }] },
  })
}

describe('session feed', () => {
  it('loads the snapshot and maps agent speakers to the apprentice side', () => {
    const s = feed(ev('a', 1_000))
    expect(s.events.map((e) => e.id)).toEqual(['a'])
    expect(s.transcript[0].speaker).toBe('agent')
  })

  it('replaces a corrected event in place instead of appending it', () => {
    let s = feed(ev('a', 1_000), ev('b', 2_000))
    s = reduce(s, { type: 'event', data: { ...ev('a', 1_000, '0410'), corrected: true } })
    expect(s.events.map((e) => [e.id, e.after, e.corrected ?? false])).toEqual([
      ['a', '0410', true],
      ['b', '0400', false],
    ])
  })

  it('places a question cue at the time of the event it is about', () => {
    let s = feed(ev('a', 1_000), ev('b', 5_000))
    s = reduce(s, { type: 'ask_now', data: { subject: 'cost center', event_id: 'a', question_index: 1, budget: 5 } })
    expect(s.asks).toEqual([{ subject: 'cost center', event_id: 'a', question_index: 1, budget: 5, ts_ms: 1_000 }])
  })

  it('fades out everything inside an off-the-record window, then drops it', () => {
    let s = feed(ev('old', 1_000), ev('new', 40_000))
    s = reduce(s, { type: 'transcript', data: { speaker: 'expert', ts_ms: 45_000, text: 'private' } })
    s = reduce(s, { type: 'ask_now', data: { subject: 'x', event_id: 'new', question_index: 1, budget: 5 } })
    s = reduce(s, {
      type: 'off_record',
      data: { from_ts: 30_000, until_ts: 60_000, frames: 3, events: 1, transcript: 1, event_ids: ['new'] },
    })

    // Still rendered, marked as leaving, so the expert sees them go.
    expect(s.events).toHaveLength(2)
    expect([...s.leaving].sort()).toEqual(['45000-expert-7', 'ask-new', 'new'])

    s = sweep(s)
    expect(s.events.map((e) => e.id)).toEqual(['old'])
    expect(s.transcript.map((l) => l.text)).toEqual(['Why capex?'])
    expect(s.asks).toEqual([])
    expect(s.lastRemoved?.events).toBe(1)
  })
})
