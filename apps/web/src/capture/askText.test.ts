import { describe, expect, it } from 'vitest'
import { askText } from './useInterviewer'

describe('ask_now cue', () => {
  it('carries the subject, the guardrail flag and the Known list', () => {
    const text = askText({
      subject: 'invoice 4473: hold',
      event_id: 'h',
      guardrail: true,
      known: [{ text: 'Over 5,000 it is capex.' }],
    })
    expect(text).toBe('ASK_NOW\nSubject: invoice 4473: hold\nGuardrail question\nKnown:\n- Over 5,000 it is capex.')
  })

  it('leaves out what is not there', () => {
    expect(askText({ subject: 'invoice 4471: edit', event_id: 'a' })).toBe('ASK_NOW\nSubject: invoice 4471: edit')
  })
})
