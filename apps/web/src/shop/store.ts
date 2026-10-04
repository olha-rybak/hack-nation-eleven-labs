import { createContext, useContext, useEffect, useState } from 'react'
import { CURRENT_USER, SYSTEM_DATE, seed, type Dataset, type ReturnCase } from './data'

export type Draft = Pick<ReturnCase, 'resolution' | 'refundAmount' | 'restockingFee' | 'note'>

export const escalationReasons = ['Refund over 200 EUR', 'Possible abuse', 'Carrier dispute', 'Customer complaint', 'Other']

const storageKey = (dataset: Dataset) => `shop:v1:${dataset}`

function load(dataset: Dataset): ReturnCase[] {
  try {
    const raw = localStorage.getItem(storageKey(dataset))
    if (raw) return JSON.parse(raw) as ReturnCase[]
  } catch {
    // Storage unavailable or corrupt: start from the seed.
  }
  return seed(dataset)
}

function now(): string {
  return `${SYSTEM_DATE} ${new Date().toTimeString().slice(0, 5)}`
}

function describeChanges(before: ReturnCase, draft: Draft): string[] {
  const changes: string[] = []
  if (before.resolution !== draft.resolution) changes.push(`Resolution set to ${draft.resolution || 'none'}`)
  if (before.refundAmount !== draft.refundAmount) changes.push(`Refund amount set to ${draft.refundAmount || '0'} EUR`)
  if (before.restockingFee !== draft.restockingFee) changes.push(draft.restockingFee ? 'Restocking fee applied' : 'Restocking fee removed')
  if (before.note !== draft.note) changes.push('Note updated')
  return changes
}

export function useShopState(dataset: Dataset) {
  const [cases, setCases] = useState<ReturnCase[]>(() => load(dataset))
  const [message, setMessage] = useState('Ready')
  const user = CURRENT_USER[dataset]

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(dataset), JSON.stringify(cases))
    } catch {
      // Not persisting is acceptable in a sandbox.
    }
  }, [dataset, cases])

  function apply(id: string, draft: Draft, extra: { status?: ReturnCase['status']; log: string[] }) {
    setCases((list) =>
      list.map((c) => {
        if (c.id !== id) return c
        const entries = [...describeChanges(c, draft), ...extra.log].map((text) => ({ at: now(), user, text }))
        return { ...c, ...draft, status: extra.status ?? c.status, log: [...c.log, ...entries] }
      }),
    )
  }

  return {
    cases,
    message,
    user,
    save(id: string, draft: Draft) {
      apply(id, draft, { log: [] })
      setMessage(`${id} saved`)
    },
    escalate(id: string, draft: Draft, reason: string, note: string) {
      apply(id, draft, { status: 'escalated', log: [`Escalated to supervisor: ${reason}${note ? `. ${note}` : ''}`] })
      setMessage(`${id} escalated to supervisor`)
    },
    complete(id: string, draft: Draft) {
      apply(id, draft, { status: 'completed', log: [`Completed: ${draft.resolution}`] })
      setMessage(`${id} completed: ${draft.resolution}`)
    },
    reset() {
      setCases(seed(dataset))
      setMessage('Sandbox data reset')
    },
  }
}

export type ShopState = ReturnType<typeof useShopState>

export const ShopContext = createContext<ShopState | null>(null)

export function useShop(): ShopState {
  const state = useContext(ShopContext)
  if (!state) throw new Error('useShop must be used inside ShopContext')
  return state
}
