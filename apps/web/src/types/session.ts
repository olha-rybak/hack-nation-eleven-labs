// The server stores speaker as free text; lib/feed.ts maps it onto these two sides.

export type Speaker = 'expert' | 'agent'

export interface TranscriptLine {
  id: string
  speaker: Speaker
  text: string
  ts_ms: number
}

export type FeedMessage = { type: 'transcript'; line: TranscriptLine }
