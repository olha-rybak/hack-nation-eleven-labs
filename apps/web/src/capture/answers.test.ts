import { describe, expect, it } from 'vitest'
import { AnswerPairer } from './answers'

describe('answer pairing', () => {
  it('pairs the question asked after ask_now with the expert reply', () => {
    const p = new AnswerPairer()
    p.ask('e1')
    p.agent('Why did you move invoice 4471 to cost center 0400?')
    expect(p.expert('Over 5,000 it is capex, so 0400.')).toEqual({
      event_id: 'e1',
      question: 'Why did you move invoice 4471 to cost center 0400?',
      answer: 'Over 5,000 it is capex, so 0400.',
    })
  })

  it('ignores the expert narrating before the agent has asked', () => {
    const p = new AnswerPairer()
    p.ask('e1')
    expect(p.expert('Now I open the next one.')).toBeNull()
    p.agent('Why 0400?')
    expect(p.expert('Capex.')?.answer).toBe('Capex.')
  })

  it('takes one answer per question', () => {
    const p = new AnswerPairer()
    p.ask('e1')
    p.agent('Why 0400?')
    p.expert('Capex.')
    p.agent('Got it, thanks.')
    expect(p.expert('And the next invoice is from Brandt.')).toBeNull()
  })

  it('drops the ask when the agent does not ask a question', () => {
    const p = new AnswerPairer()
    p.ask('e1')
    p.agent('Carry on.')
    expect(p.expert('Okay.')).toBeNull()
  })

  it('a new ask_now replaces an unanswered one', () => {
    const p = new AnswerPairer()
    p.ask('e1')
    p.ask('e2')
    p.agent('Why is 4472 on hold?')
    expect(p.expert('Nordtec double-bills in December.')?.event_id).toBe('e2')
  })
})
