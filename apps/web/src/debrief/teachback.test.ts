import { describe, expect, it } from 'vitest'
import { correctedCue, teachBackCue, TeachBackTurns } from './teachback'

describe('teach-back turns', () => {
  it('reads a confirmation', () => {
    const t = new TeachBackTurns()
    t.cue()
    expect(t.agent('So, as I understand it, ... Did I get that right?')).toBeNull()
    t.expert('Yes, exactly.')
    expect(t.agent("Great, that's confirmed.")).toEqual({ kind: 'confirmed' })
    expect(t.agent("Great, that's confirmed.")).toBeNull() // answered once
  })

  it('collects what the expert corrected, ignoring silence', () => {
    const t = new TeachBackTurns()
    t.cue()
    t.expert('...')
    t.expert('No, the supervisor limit is three hundred,')
    t.expert('not two hundred.')
    expect(t.agent("Got it, I'll fix that.")).toEqual({
      kind: 'correct',
      text: 'No, the supervisor limit is three hundred, not two hundred.',
    })
  })

  it('a fix with nothing said is not a correction', () => {
    const t = new TeachBackTurns()
    t.cue()
    expect(t.agent("Got it, I'll fix that.")).toBeNull()
  })

  it('cues carry the text, the question and the two exact sentences', () => {
    const cue = teachBackCue('Damaged in transit is a carrier claim.')
    expect(cue.startsWith('TEACH_BACK\n')).toBe(true)
    expect(cue).toContain('Damaged in transit is a carrier claim.')
    expect(cue).toContain('"Great, that\'s confirmed."')
    const fixed = correctedCue([{ target: 'guardrail', ref: 'g', label: 'x', field: 'statement', before: 'a', after: 'Over 300 EUR.' }])
    expect(fixed).toContain('- Over 300 EUR.')
    expect(correctedCue([])).toContain('Nothing in the Work Map changed.')
  })
})
