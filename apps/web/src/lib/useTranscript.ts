import { useEffect, useState } from 'react'
import type { TranscriptLine } from '../types/session'
import { openFeed } from './feed'

interface State {
  sessionId: string
  lines: TranscriptLine[]
}

export function useTranscript(sessionId: string | null): TranscriptLine[] {
  const [state, setState] = useState<State>({ sessionId: sessionId ?? '', lines: [] })

  useEffect(() => {
    if (!sessionId) return
    const connection = openFeed(sessionId, (message) => {
      if (message.type !== 'transcript') return
      setState((prev) =>
        prev.sessionId === sessionId
          ? { sessionId, lines: [...prev.lines, message.line] }
          : { sessionId, lines: [message.line] },
      )
    })
    return () => connection.close()
  }, [sessionId])

  return sessionId && state.sessionId === sessionId ? state.lines : []
}
