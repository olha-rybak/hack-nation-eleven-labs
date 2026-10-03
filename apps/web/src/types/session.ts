// Provisional until the session log format lands in T-105.

export type Speaker = 'expert' | 'agent'

export interface TranscriptLine {
  id: string
  speaker: Speaker
  text: string
  ts_ms: number
}

export type FeedMessage = { type: 'transcript'; line: TranscriptLine }
