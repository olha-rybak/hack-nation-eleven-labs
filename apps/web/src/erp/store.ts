import { createContext, useContext, useEffect, useState } from 'react'
import { CURRENT_USER, SYSTEM_DATE, seed, type Dataset, type Invoice } from './data'

export type Draft = Pick<Invoice, 'costCenter' | 'assetNumber' | 'comment' | 'approvers'>

export const holdReasons = [
  'Possible duplicate',
  'Price or quantity difference',
  'Missing purchase order',
  'Waiting for credit note',
  'Other',
]

const storageKey = (dataset: Dataset) => `erp:v1:${dataset}`

function load(dataset: Dataset): Invoice[] {
  try {
    const raw = localStorage.getItem(storageKey(dataset))
    if (raw) return JSON.parse(raw) as Invoice[]
  } catch {
    // Storage unavailable or corrupt: start from the seed.
  }
  return seed(dataset)
}

function now(): string {
  const time = new Date().toTimeString().slice(0, 5)
  return `${SYSTEM_DATE} ${time}`
}

function describeChanges(before: Invoice, draft: Draft): string[] {
  const changes: string[] = []
  if (before.costCenter !== draft.costCenter) changes.push(`Cost center changed ${before.costCenter} → ${draft.costCenter}`)
  if (before.assetNumber !== draft.assetNumber) {
    changes.push(draft.assetNumber ? `Asset number set to ${draft.assetNumber}` : 'Asset number removed')
  }
  if (before.comment !== draft.comment) changes.push('Comment updated')
  const added = draft.approvers.filter((a) => !before.approvers.includes(a))
  const removed = before.approvers.filter((a) => !draft.approvers.includes(a))
  if (added.length) changes.push(`Approver added: ${added.join(', ')}`)
  if (removed.length) changes.push(`Approver removed: ${removed.join(', ')}`)
  return changes
}

export function useErpState(dataset: Dataset) {
  const [invoices, setInvoices] = useState<Invoice[]>(() => load(dataset))
  const [message, setMessage] = useState('Ready')
  const user = CURRENT_USER[dataset]

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(dataset), JSON.stringify(invoices))
    } catch {
      // Not persisting is acceptable in a sandbox.
    }
  }, [dataset, invoices])

  function apply(id: string, draft: Draft, extra: { status?: Invoice['status']; documentNo?: string; log: string[] }) {
    setInvoices((list) =>
      list.map((inv) => {
        if (inv.id !== id) return inv
        const entries = [...describeChanges(inv, draft), ...extra.log].map((text) => ({ at: now(), user, text }))
        return {
          ...inv,
          ...draft,
          status: extra.status ?? inv.status,
          documentNo: extra.documentNo ?? inv.documentNo,
          log: [...inv.log, ...entries],
        }
      }),
    )
  }

  return {
    invoices,
    message,
    user,
    save(id: string, draft: Draft) {
      apply(id, draft, { log: [] })
      setMessage(`${id} saved`)
    },
    hold(id: string, draft: Draft, reason: string, note: string) {
      apply(id, draft, { status: 'on_hold', log: [`Put on hold: ${reason}${note ? `. ${note}` : ''}`] })
      setMessage(`${id} put on hold`)
    },
    release(id: string, draft: Draft) {
      apply(id, draft, { status: 'open', log: ['Hold released'] })
      setMessage(`${id} released from hold`)
    },
    sendForApproval(id: string, draft: Draft) {
      apply(id, draft, { status: 'in_approval', log: [`Sent for approval to ${draft.approvers.join(', ')}`] })
      setMessage(`${id} sent for approval to ${draft.approvers.join(', ')}`)
    },
    post(id: string, draft: Draft) {
      const last = Math.max(5100042116, ...invoices.map((inv) => Number(inv.documentNo ?? 0)))
      const documentNo = String(last + 1)
      apply(id, draft, { status: 'posted', documentNo, log: [`Posted, document ${documentNo}`] })
      setMessage(`${id} posted, document ${documentNo}`)
    },
    reset() {
      setInvoices(seed(dataset))
      setMessage('Sandbox data reset')
    },
  }
}

export type ErpState = ReturnType<typeof useErpState>

export const ErpContext = createContext<ErpState | null>(null)

export function useErp(): ErpState {
  const state = useContext(ErpContext)
  if (!state) throw new Error('useErp must be used inside ErpContext')
  return state
}
