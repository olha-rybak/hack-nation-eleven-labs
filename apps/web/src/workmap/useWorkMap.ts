import { useEffect, useState } from 'react'
import type { WorkMap } from '../types/workmap'
import { fetchWorkMap, WorkMapNotFound } from './api'

export type WorkMapState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; map: WorkMap }

export function useWorkMap(sessionId: string): WorkMapState {
  const [result, setResult] = useState<{ sessionId: string; state: WorkMapState } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchWorkMap(sessionId, controller.signal).then(
      (map) => setResult({ sessionId, state: { status: 'ready', map } }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        const state: WorkMapState =
          err instanceof WorkMapNotFound
            ? { status: 'missing' }
            : { status: 'error', message: err instanceof Error ? err.message : String(err) }
        setResult({ sessionId, state })
      },
    )
    return () => controller.abort()
  }, [sessionId])

  return result?.sessionId === sessionId ? result.state : { status: 'loading' }
}
