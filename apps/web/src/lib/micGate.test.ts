import { describe, expect, it } from 'vitest'
import { MicGate } from './micGate'

describe('MicGate', () => {
  it('is closed until the agent has finished asking', () => {
    const g = new MicGate(20000)
    expect(g.open(0)).toBe(false)
    g.agentMode(true, 0)
    g.question(0)
    expect(g.open(1000)).toBe(false)
    g.agentMode(false, 2000)
    expect(g.open(2000)).toBe(true)
  })

  it('opens when the question text arrives after the agent stopped speaking', () => {
    const g = new MicGate(5000)
    g.agentMode(true, 0)
    g.agentMode(false, 1000)
    g.question(9000)
    expect(g.open(9000)).toBe(true)
  })

  it('closes when the answer arrives', () => {
    const g = new MicGate(20000)
    g.question(0)
    g.agentMode(true, 0)
    g.agentMode(false, 1000)
    g.close()
    expect(g.open(1500)).toBe(false)
  })

  it('closes after the window without voice, and voice extends it', () => {
    const g = new MicGate(5000)
    g.question(0)
    g.agentMode(true, 0)
    g.agentMode(false, 1000)
    g.voice(4000)
    expect(g.open(8000)).toBe(true)
    expect(g.open(9000)).toBe(false)
    expect(g.open(9100)).toBe(false) // stays closed, even if no one calls close()
  })

  it('closes while the agent speaks again, so noise cannot interrupt it', () => {
    const g = new MicGate(20000)
    g.question(0)
    g.agentMode(true, 0)
    g.agentMode(false, 1000)
    g.agentMode(true, 2000)
    expect(g.open(2500)).toBe(false)
    g.agentMode(false, 3000)
    expect(g.open(3000)).toBe(true)
  })
})
