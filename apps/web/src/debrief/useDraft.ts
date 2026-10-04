import { useEffect, useState } from 'react'
import type { DraftWorkMap } from '../types/draft'
import { buildDraft, fetchDraft } from './api'

export type DraftState =
  | { status: 'loading' }
  | { status: 'building' }
  | { status: 'error'; message: string }
  | { status: 'ready'; draft: DraftWorkMap }

/** The session's draft Work Map: the saved one, or built now if End task left none. */
export function useDraft(sessionId: string) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; state: DraftState } | null>(null)
  const key = `${sessionId}#${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    const set = (state: DraftState) => {
      if (!controller.signal.aborted) setResult({ key, state })
    }
    ;(async () => {
      try {
        const saved = await fetchDraft(sessionId, controller.signal)
        if (saved) return set({ status: 'ready', draft: saved })
        set({ status: 'building' })
        set({ status: 'ready', draft: await buildDraft(sessionId, controller.signal) })
      } catch (err) {
        set({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => controller.abort()
  }, [sessionId, key])

  const state: DraftState = result?.key === key ? result.state : { status: 'loading' }
  return { state, retry: () => setAttempt((n) => n + 1) }
}
