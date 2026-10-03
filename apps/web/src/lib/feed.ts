import type { FeedMessage } from '../types/session'
import { openMockFeed } from './mockFeed'

export interface FeedConnection {
  close(): void
}

type Listener = (message: FeedMessage) => void

const useMock = import.meta.env.VITE_MOCK === '1'

export function openFeed(sessionId: string, onMessage: Listener): FeedConnection {
  if (useMock) return openMockFeed(onMessage)

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${protocol}://${location.host}/api/sessions/${sessionId}/feed`)
  socket.addEventListener('message', (event) => {
    onMessage(JSON.parse(event.data) as FeedMessage)
  })
  return { close: () => socket.close() }
}
