// The teach-back after the debrief questions (T-204). The apprentice explains the process back; the
// expert agrees or corrects it. The agent's reply is read by software, so the cue asks for one of two
// exact English sentences: "Great, that's confirmed." or "Got it, I'll fix that."

export interface WorkMapChange {
  target: 'step' | 'guardrail'
  ref: string
  label: string
  field: string
  before: string
  after: string
}

export type TeachBackOutcome = { kind: 'confirmed' } | { kind: 'correct'; text: string }

const CONFIRMED = /that'?s confirmed/i
const FIXING = /i'?ll fix that/i
// Speech-to-text sends "..." for silence or noise: not a correction.
const WORDS = /[\p{L}\p{N}]/u

const RULES = [
  'When they answer, say one of these two sentences exactly, in English, and nothing else:',
  '- "Great, that\'s confirmed." if they agree that it is right.',
  '- "Got it, I\'ll fix that." if they correct anything.',
]

export function teachBackCue(text: string): string {
  return [
    'TEACH_BACK',
    'Explain the whole process back to the expert as your own understanding, in their language and in',
    'under a minute, saying this:',
    text,
    'Then ask: "Did I get that right?"',
    ...RULES,
  ].join('\n')
}

export function correctedCue(changes: WorkMapChange[]): string {
  const said = changes.length
    ? ['The Work Map now says:', ...changes.map((c) => `- ${c.after}`), 'Say the corrected part back in one sentence, then ask: "Anything else?"']
    : ['Nothing in the Work Map changed. Ask in one sentence what exactly should be different.']
  return ['CORRECTED', ...said, ...RULES].join('\n')
}

export class TeachBackTurns {
  private open = false
  private words: string[] = []

  cue(): void {
    this.open = true
    this.words = []
  }

  expert(text: string): void {
    if (this.open && WORDS.test(text)) this.words.push(text.trim())
  }

  /** The agent spoke. Returns the expert's verdict once the agent has said one of the two sentences. */
  agent(text: string): TeachBackOutcome | null {
    if (!this.open) return null
    if (CONFIRMED.test(text)) {
      this.open = false
      return { kind: 'confirmed' }
    }
    if (FIXING.test(text) && this.words.length) {
      this.open = false
      return { kind: 'correct', text: this.words.join(' ') }
    }
    return null
  }
}
