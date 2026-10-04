import { describe, expect, it } from 'vitest'
import { SpeechTracker } from './speech'

describe('SpeechTracker', () => {
  it('starts on the first score over the threshold and reports it once', () => {
    const t = new SpeechTracker(0.5, 400)
    expect(t.score(0.1, 0)).toBeNull()
    expect(t.score(0.8, 100)).toBe(true)
    expect(t.score(0.9, 200)).toBeNull()
  })

  it('rides through short dips between words', () => {
    const t = new SpeechTracker(0.5, 400)
    t.score(0.8, 0)
    expect(t.score(0.1, 200)).toBeNull()
    expect(t.score(0.8, 350)).toBeNull()
    expect(t.score(0.1, 700)).toBeNull()
  })

  it('ends after release time without voice', () => {
    const t = new SpeechTracker(0.5, 400)
    t.score(0.8, 0)
    expect(t.score(0.1, 399)).toBeNull()
    expect(t.score(0.1, 400)).toBe(false)
    expect(t.score(0.1, 900)).toBeNull()
  })

  it('ends on the timer when scores stop arriving', () => {
    const t = new SpeechTracker(0.5, 400)
    t.score(0.8, 0)
    expect(t.expire(300)).toBeNull()
    expect(t.expire(450)).toBe(false)
    expect(t.expire(1000)).toBeNull()
  })
})
