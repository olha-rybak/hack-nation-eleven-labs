import { describe, expect, it } from 'vitest'
import { spoken } from './spoken'

describe('spoken', () => {
  it('drops delivery cues', () => {
    expect(spoken('[Patiently] Why did you switch to replacement?')).toBe('Why did you switch to replacement?')
    expect(spoken('[Warmly] Okay. [laughs]')).toBe('Okay.')
  })

  it('keeps redaction placeholders and plain text', () => {
    expect(spoken('Ask <PERSON_2> first.')).toBe('Ask <PERSON_2> first.')
    expect(spoken('Got it, thanks.')).toBe('Got it, thanks.')
  })
})
