// Reads the debrief conversation (T-203). After a NEXT_GAP cue the agent asks; the expert answers,
// maybe over several turns. The agent's next line says how it went, as its prompt
// (prompts/debrief/system.md) words it: a question is a follow-up, "Okay, skipping that one." is
// a decline, "Okay, let's stop here." ends the debrief, and anything else acknowledges an answer.

import type { Gap } from '../types/draft'

export type Outcome =
  | { kind: 'answered'; gapId: string; text: string }
  | { kind: 'declined'; gapId: string }
  | { kind: 'stop' }

const SKIPPED = /skipping that one/i
// Speech-to-text sends "..." for silence or noise: not an answer.
const WORDS = /[\p{L}\p{N}]/u
const STOPPED = /let'?s stop here/i

export function nextGapText(gap: Gap, about: string | null): string {
  const lines = ['NEXT_GAP', `Gap: ${gap.question}`]
  if (about) lines.push(`About: ${about}`)
  lines.push(`Why: ${gap.why_it_matters}`)
  return lines.join('\n')
}

export class DebriefTurns {
  private gapId: string | null = null
  private asked = false
  private answer: string[] = []

  cue(gapId: string): void {
    this.gapId = gapId
    this.asked = false
    this.answer = []
  }

  expert(text: string): void {
    if (this.gapId && this.asked && WORDS.test(text)) this.answer.push(text.trim())
  }

  /** The agent spoke. Returns what happened to the current gap, or null while it is still open. */
  agent(text: string): Outcome | null {
    const gapId = this.gapId
    if (!gapId) return null
    if (STOPPED.test(text)) return this.close({ kind: 'stop' })
    if (!this.asked) {
      this.asked = true // its first line after the cue is the question
      return null
    }
    if (SKIPPED.test(text)) return this.close({ kind: 'declined', gapId })
    if (text.trim().endsWith('?') || this.answer.length === 0) return null // a follow-up
    return this.close({ kind: 'answered', gapId, text: this.answer.join(' ') })
  }

  private close(outcome: Outcome): Outcome {
    this.gapId = null
    return outcome
  }
}
