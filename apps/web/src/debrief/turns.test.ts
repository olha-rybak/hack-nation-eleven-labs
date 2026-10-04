import { describe, expect, it } from 'vitest'
import { DebriefTurns, nextGapText } from './turns'
import type { Gap } from '../types/draft'

const gap: Gap = {
  id: 'gap-1',
  kind: 'no_reason',
  step_index: 2,
  guardrail_id: null,
  question: 'You held the 4472 invoice. Who releases it?',
  why_it_matters: 'Decides holds',
  importance: 5,
  status: 'open',
  answer: null,
  fact_id: null,
}

function asked() {
  const t = new DebriefTurns()
  t.cue('gap-1')
  expect(t.agent('I have a few questions. Who releases the held 4472 invoice?')).toBeNull()
  return t
}

describe('debrief turns', () => {
  it('an acknowledgement closes the gap with everything the expert said', () => {
    const t = asked()
    t.expert('Petra does.')
    t.expert('Only in January.')
    expect(t.agent('Got it, thanks.')).toEqual({ kind: 'answered', gapId: 'gap-1', text: 'Petra does. Only in January.' })
    expect(t.agent('Anything else.')).toBeNull() // nothing cued any more
  })

  it('a follow-up question keeps the gap open', () => {
    const t = asked()
    t.expert('It depends.')
    expect(t.agent('Depends on what, the amount?')).toBeNull()
    t.expert('Over ten thousand it needs Petra.')
    expect(t.agent('Got it.')).toEqual({ kind: 'answered', gapId: 'gap-1', text: 'It depends. Over ten thousand it needs Petra.' })
  })

  it('skip and stop phrases decline or end', () => {
    const skip = asked()
    skip.expert('No idea, skip.')
    expect(skip.agent('Okay, skipping that one.')).toEqual({ kind: 'declined', gapId: 'gap-1' })
    const stop = asked()
    stop.expert("That's enough for today.")
    expect(stop.agent("Okay, let's stop here.")).toEqual({ kind: 'stop' })
  })

  it('an acknowledgement before any answer is not an answer', () => {
    const t = asked()
    t.expert('...')
    t.expert(' … ')
    expect(t.agent('Take your time.')).toBeNull()
  })

  it('the cue names the gap, the step and why it matters', () => {
    expect(nextGapText(gap, 'Hold invoice 4472: put on hold')).toBe(
      'NEXT_GAP\nGap: You held the 4472 invoice. Who releases it?\nAbout: Hold invoice 4472: put on hold\nWhy: Decides holds',
    )
    expect(nextGapText(gap, null)).not.toContain('About:')
  })
})
