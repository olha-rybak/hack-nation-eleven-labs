import type { FeedMessage, TranscriptLine } from '../types/session'
import type { FeedConnection } from './feed'

const script: Omit<TranscriptLine, 'id'>[] = [
  { speaker: 'expert', ts_ms: 4_000, text: 'Okay, first the Weber invoice. That one is due before close.' },
  { speaker: 'expert', ts_ms: 31_000, text: 'Seven thousand two hundred, a spindle unit. I change the cost center.' },
  { speaker: 'agent', ts_ms: 46_000, text: 'You moved that one to capex. What made you do that?' },
  { speaker: 'expert', ts_ms: 49_000, text: 'Equipment over five thousand euros is always capex.' },
  { speaker: 'expert', ts_ms: 72_000, text: 'Nordtec again. I have seen this line before, in November.' },
  { speaker: 'agent', ts_ms: 95_000, text: 'You put the Nordtec invoice on hold. Who decides when it gets released?' },
  { speaker: 'expert', ts_ms: 99_000, text: 'I do, once purchasing confirms it is not a duplicate.' },
]

const STEP_MS = 1_800

export function openMockFeed(onMessage: (message: FeedMessage) => void): FeedConnection {
  let index = 0
  const timer = setInterval(() => {
    if (index >= script.length) {
      clearInterval(timer)
      return
    }
    onMessage({ type: 'transcript', line: { id: `mock-${index}`, ...script[index] } })
    index += 1
  }, STEP_MS)
  return { close: () => clearInterval(timer) }
}
