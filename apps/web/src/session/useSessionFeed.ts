import { useEffect, useReducer, useRef } from 'react'
import type { EventCorrection, OffRecordRemoved, ScreenEvent } from '../types/session'
import { emptyFeed, reduce, sweep, type FeedMessage, type FeedState } from './feed'
import { openMockSession, type MockSession } from './mockSession'

const useMock = import.meta.env.VITE_MOCK === '1'
const LEAVE_MS = 450

type Action = { kind: 'message'; msg: FeedMessage } | { kind: 'sweep' } | { kind: 'reset' }

function reducer(state: FeedState, action: Action): FeedState {
  if (action.kind === 'reset') return emptyFeed
  if (action.kind === 'sweep') return sweep(state)
  return reduce(state, action.msg)
}

export function useSessionFeed(sessionId: string | null) {
  const [state, dispatch] = useReducer(reducer, emptyFeed)
  const mock = useRef<MockSession | null>(null)

  useEffect(() => {
    dispatch({ kind: 'reset' })
    if (!sessionId) return
    const onMessage = (msg: FeedMessage) => {
      dispatch({ kind: 'message', msg })
      // Items in an off-the-record window fade out, then disappear.
      if (msg.type === 'off_record') setTimeout(() => dispatch({ kind: 'sweep' }), LEAVE_MS)
    }

    if (useMock) {
      mock.current = openMockSession(onMessage)
      return () => {
        mock.current?.close()
        mock.current = null
      }
    }

    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${location.host}/api/ws/session/${encodeURIComponent(sessionId)}`)
    socket.addEventListener('message', (e) => onMessage(JSON.parse(e.data) as FeedMessage))
    return () => socket.close()
  }, [sessionId])

  async function correctEvent(id: string, patch: EventCorrection): Promise<ScreenEvent> {
    if (useMock) {
      const ev = mock.current?.correct(id, patch)
      if (!ev) throw new Error('unknown event')
      return ev
    }
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId!)}/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`Saving the correction failed (${res.status})`)
    return (await res.json()) as ScreenEvent
  }

  async function offTheRecord(untilTs: number, windowMs: number): Promise<OffRecordRemoved> {
    if (useMock) return mock.current!.offRecord(untilTs, windowMs)
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId!)}/off-the-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ until_ts: untilTs }),
    })
    if (!res.ok) throw new Error(`Off the record failed (${res.status})`)
    return (await res.json()) as OffRecordRemoved
  }

  return { ...state, correctEvent, offTheRecord }
}
