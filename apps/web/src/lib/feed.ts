import type { FeedMessage, Speaker, TranscriptLine } from '../types/session'
import { openMockFeed } from './mockFeed'

export interface FeedConnection {
  close(): void
}

type Listener = (message: FeedMessage) => void

const useMock = import.meta.env.VITE_MOCK === '1'
const AGENT_SPEAKERS = new Set(['agent', 'apprentice', 'interviewer', 'tutor'])

interface ServerLine {
  speaker: string
  ts_ms: number
  text: string
}

// Server: /ws/session/:id sends {type: 'snapshot', data: {events, transcript}} on connect,
// then {type: 'transcript', data: line} per new line (apps/server/apprentice/session/routes.py).
type ServerMessage =
  | { type: 'snapshot'; data: { transcript: ServerLine[] } }
  | { type: 'transcript'; data: ServerLine }
  | { type: string; data: unknown }

function toLine(raw: ServerLine): TranscriptLine {
  const speaker: Speaker = AGENT_SPEAKERS.has(raw.speaker.toLowerCase()) ? 'agent' : 'expert'
  return { id: `${raw.ts_ms}-${raw.speaker}`, speaker, ts_ms: raw.ts_ms, text: raw.text }
}

export function openFeed(sessionId: string, onMessage: Listener): FeedConnection {
  if (useMock) return openMockFeed(onMessage)

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${protocol}://${location.host}/api/ws/session/${encodeURIComponent(sessionId)}`)
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage
    if (msg.type === 'snapshot') {
      for (const raw of (msg.data as { transcript: ServerLine[] }).transcript) {
        onMessage({ type: 'transcript', line: toLine(raw) })
      }
    } else if (msg.type === 'transcript') {
      onMessage({ type: 'transcript', line: toLine(msg.data as ServerLine) })
    }
  })
  return { close: () => socket.close() }
}
