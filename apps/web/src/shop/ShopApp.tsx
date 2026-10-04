// The returns desk is a second app the expert can share, next to the ERP. Like the ERP it must not
// import anything from the apprentice side, and it borrows the ERP's look.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router'
import { formatDate, formatDateTime, formatMoney } from '../erp/format'
import {
  RESTOCKING_FEE,
  RETURN_WINDOW_DAYS,
  SHOP,
  SYSTEM_DATE,
  daysSince,
  resolutions,
  type CaseStatus,
  type Dataset,
  type Resolution,
  type ReturnCase,
} from './data'
import { ShopContext, escalationReasons, useShop, useShopState, type Draft } from './store'
import '../erp/erp.css'

const statusLabel: Record<CaseStatus, string> = { open: 'Open', escalated: 'Escalated', completed: 'Completed' }
// Reuses the ERP's tag colours.
const statusClass: Record<CaseStatus, string> = { open: 'open', escalated: 'in_approval', completed: 'posted' }

export function ShopApp() {
  const [params] = useSearchParams()
  const dataset: Dataset = params.get('case') === 'training' ? 'training' : 'expert'
  return <ShopSession key={dataset} dataset={dataset} />
}

function ShopSession({ dataset }: { dataset: Dataset }) {
  const state = useShopState(dataset)

  // The tab title is what the expert picks in the browser's share dialog.
  useEffect(() => {
    const previous = document.title
    document.title = 'Lumen Returns Desk'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <ShopContext.Provider value={state}>
      <div className="erp">
        <header className="erp-header">
          <span className="erp-logo">Returns Desk</span>
          <span className="erp-company">{SHOP}</span>
          <span className="erp-header-right">
            {formatDate(SYSTEM_DATE)} · User {state.user}
            <button type="button" className="erp-link-button" onClick={state.reset}>
              Reset sandbox
            </button>
          </span>
        </header>
        <div className="erp-frame">
          <nav className="erp-nav" aria-label="Modules">
            <span className="erp-nav-group">Customer service</span>
            <Link to={{ pathname: '/shop', search: location.search }} className="erp-nav-item active">
              Return requests
            </Link>
          </nav>
          <main className="erp-main">
            <Routes>
              <Route index element={<CaseList />} />
              <Route path="returns/:id" element={<DetailRoute />} />
            </Routes>
          </main>
        </div>
        <footer className="erp-status" role="status">
          {state.message}
        </footer>
      </div>
    </ShopContext.Provider>
  )
}

function DetailRoute() {
  const { id = '' } = useParams()
  return <CaseDetail key={id} id={id} />
}

function CaseList() {
  const { cases } = useShop()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const rows = cases.filter((c) => filter === 'all' || c.status === 'open')
  const open = (id: string) => navigate({ pathname: `/shop/returns/${id}`, search: location.search })

  return (
    <section>
      <div className="erp-titlebar">
        <h1>Return requests</h1>
      </div>
      <div className="erp-toolbar">
        <div className="erp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={filter === 'open'} onClick={() => setFilter('open')}>
            To process ({cases.filter((c) => c.status === 'open').length})
          </button>
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
            All ({cases.length})
          </button>
        </div>
      </div>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Return</th>
            <th>Customer</th>
            <th>Item</th>
            <th>Reason</th>
            <th>Delivered</th>
            <th className="num">Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} onClick={() => open(c.id)} onKeyDown={(e) => e.key === 'Enter' && open(c.id)} tabIndex={0}>
              <td className="mono">{c.id}</td>
              <td>{c.customer.name}</td>
              <td>{c.item}</td>
              <td>{c.reason}</td>
              <td>{formatDate(c.delivered)}</td>
              <td className="num">{formatMoney(c.price)}</td>
              <td>
                <span className={`erp-status-tag ${statusClass[c.status]}`}>{statusLabel[c.status]}</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="empty">
              <td colSpan={7}>No return requests.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}

const draftOf = (c: ReturnCase): Draft => ({
  resolution: c.resolution,
  refundAmount: c.refundAmount,
  restockingFee: c.restockingFee,
  note: c.note,
})

function CaseDetail({ id }: { id: string }) {
  const shop = useShop()
  const item = shop.cases.find((c) => c.id === id)
  const [draft, setDraft] = useState<Draft | null>(item ? draftOf(item) : null)
  const [escalating, setEscalating] = useState(false)
  const navigate = useNavigate()

  if (!item || !draft) {
    return (
      <section className="erp-panel">
        <p>Return {id} does not exist.</p>
        <Link to={{ pathname: '/shop', search: location.search }}>Back to return requests</Link>
      </section>
    )
  }

  const editable = item.status === 'open'
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(item))
  const days = daysSince(item.delivered)
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const toList = () => navigate({ pathname: '/shop', search: location.search })
  const refunds = draft.resolution === 'Refund' || draft.resolution === 'Goodwill refund'

  return (
    <section>
      <div className="erp-titlebar">
        <Link to={{ pathname: '/shop', search: location.search }} className="erp-back">
          Return requests
        </Link>
        <h1>
          Return {item.id}
          <span className={`erp-status-tag ${statusClass[item.status]}`}>{statusLabel[item.status]}</span>
        </h1>
        {dirty && <span className="erp-unsaved">Unsaved changes</span>}
      </div>

      <div className="erp-detail">
        <div className="erp-col">
          <fieldset className="erp-panel">
            <legend>Order</legend>
            <dl className="erp-fields">
              <dt>Order no.</dt>
              <dd className="mono">{item.orderNo}</dd>
              <dt>Item</dt>
              <dd>{item.item}</dd>
              <dt>SKU</dt>
              <dd className="mono">{item.sku}</dd>
              <dt>Price paid</dt>
              <dd>{formatMoney(item.price)}</dd>
              <dt>Delivered</dt>
              <dd>
                {formatDate(item.delivered)} by {item.carrier} ({days} {days === 1 ? 'day' : 'days'} ago, return window {RETURN_WINDOW_DAYS} days)
              </dd>
              <dt>Item opened</dt>
              <dd>{item.opened ? 'Yes' : 'No'}</dd>
              <dt>Packaging</dt>
              <dd>{item.packaging}</dd>
            </dl>
          </fieldset>

          <fieldset className="erp-panel">
            <legend>Request</legend>
            <dl className="erp-fields">
              <dt>Reason</dt>
              <dd>{item.reason}</dd>
              <dt>Customer message</dt>
              <dd>{item.message}</dd>
            </dl>
          </fieldset>

          <fieldset className="erp-panel" disabled={!editable}>
            <legend>Decision</legend>
            <div className="erp-form">
              <label htmlFor="resolution">Resolution</label>
              <select id="resolution" value={draft.resolution} onChange={(e) => set({ resolution: e.target.value as Resolution | '' })}>
                <option value="">Select…</option>
                {resolutions.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>

              <label htmlFor="refund-amount">Refund amount (EUR)</label>
              <input
                id="refund-amount"
                inputMode="decimal"
                value={draft.refundAmount}
                disabled={!refunds}
                onChange={(e) => set({ refundAmount: e.target.value })}
                placeholder="0.00"
              />

              <label htmlFor="restocking-fee">Restocking fee</label>
              <div className="erp-inline">
                <input
                  id="restocking-fee"
                  type="checkbox"
                  style={{ flex: 'none' }}
                  checked={draft.restockingFee}
                  disabled={!refunds}
                  onChange={(e) => {
                    const fee = e.target.checked
                    const amount = fee ? item.price * (1 - RESTOCKING_FEE) : item.price
                    set({ restockingFee: fee, refundAmount: amount.toFixed(2) })
                  }}
                />
                <span>{Math.round(RESTOCKING_FEE * 100)} % deducted from the refund</span>
              </div>

              <label htmlFor="note">Note</label>
              <textarea id="note" rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
            </div>
          </fieldset>
        </div>

        <div className="erp-col side">
          <fieldset className="erp-panel">
            <legend>Customer</legend>
            <dl className="erp-fields">
              <dt>Name</dt>
              <dd>{item.customer.name}</dd>
              <dt>Email</dt>
              <dd>{item.customer.email}</dd>
              <dt>City</dt>
              <dd>{item.customer.city}</dd>
              <dt>Customer since</dt>
              <dd>{formatDate(item.customer.since)}</dd>
              <dt>Orders (12 months)</dt>
              <dd>{item.customer.orders12m}</dd>
              <dt>Returns (12 months)</dt>
              <dd>{item.customer.returns12m}</dd>
            </dl>
          </fieldset>

          <fieldset className="erp-panel">
            <legend>History</legend>
            <ol className="erp-log">
              {item.log.map((entry, i) => (
                <li key={i}>
                  <span className="mono">{formatDateTime(entry.at)}</span> <span className="muted">{entry.user}</span>
                  <div>{entry.text}</div>
                </li>
              ))}
            </ol>
          </fieldset>
        </div>
      </div>

      {editable && (
        <div className="erp-actions">
          <button type="button" disabled={!dirty} onClick={() => shop.save(item.id, draft)}>
            Save
          </button>
          <button type="button" onClick={() => setEscalating(true)}>
            Escalate to supervisor
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="primary"
            disabled={!draft.resolution}
            onClick={() => {
              shop.complete(item.id, draft)
              toList()
            }}
          >
            Complete
          </button>
        </div>
      )}

      {escalating && (
        <EscalateDialog
          caseId={item.id}
          onCancel={() => setEscalating(false)}
          onConfirm={(reason, note) => {
            shop.escalate(item.id, draft, reason, note)
            setEscalating(false)
            toList()
          }}
        />
      )}
    </section>
  )
}

function Dialog({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog ref={ref} className="erp-dialog" onCancel={onCancel} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </dialog>
  )
}

function EscalateDialog({
  caseId,
  onCancel,
  onConfirm,
}: {
  caseId: string
  onCancel: () => void
  onConfirm: (reason: string, note: string) => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  return (
    <Dialog title={`Escalate ${caseId}`} onCancel={onCancel}>
      <div className="erp-form">
        <label htmlFor="escalate-reason">Reason</label>
        <select id="escalate-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select…</option>
          {escalationReasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <label htmlFor="escalate-note">Note</label>
        <textarea id="escalate-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="erp-actions in-dialog">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <span className="spacer" />
        <button type="button" className="primary" disabled={!reason} onClick={() => onConfirm(reason, note.trim())}>
          Escalate
        </button>
      </div>
    </Dialog>
  )
}
