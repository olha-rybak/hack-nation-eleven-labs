// The returns desk is a second app the expert can share, next to the ERP. Like the ERP it must not
// import anything from the apprentice side: the apprentice only ever sees it through screen pixels.

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
import './shop.css'

const statusLabel: Record<CaseStatus, string> = { open: 'Open', escalated: 'Escalated', completed: 'Completed' }

function initials(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function ago(days: number): string {
  if (days === 0) return 'today'
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

const BoxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </svg>
)

const InboxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
  </svg>
)

const BackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 18-6-6 6-6" />
  </svg>
)

function Badge({ status }: { status: CaseStatus }) {
  return <span className={`shop-badge ${status}`}>{statusLabel[status]}</span>
}

export function ShopApp() {
  const [params] = useSearchParams()
  const dataset: Dataset = params.get('case') === 'training' ? 'training' : 'expert'
  return <ShopSession key={dataset} dataset={dataset} />
}

function ShopSession({ dataset }: { dataset: Dataset }) {
  const state = useShopState(dataset)
  const openCount = state.cases.filter((c) => c.status === 'open').length

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
      <div className="shop">
        <header className="shop-top">
          <span className="shop-brand">
            <span className="shop-mark">
              <BoxIcon />
            </span>
            Returns Desk <small>{SHOP}</small>
          </span>
          <span className="shop-top-right">
            <span>{formatDate(SYSTEM_DATE)}</span>
            <button type="button" className="shop-linkbtn" onClick={state.reset}>
              Reset sandbox
            </button>
            <span className="shop-user">
              <span className="shop-avatar">{initials(state.user)}</span>
              {state.user}
            </span>
          </span>
        </header>
        <div className="shop-frame">
          <nav className="shop-rail" aria-label="Modules">
            <h2>Customer service</h2>
            <Link to={{ pathname: '/shop', search: location.search }} className="shop-navitem active">
              <InboxIcon />
              Return requests
              <span className="count">{openCount}</span>
            </Link>
          </nav>
          <main className="shop-main">
            <div className="shop-page">
              <Routes>
                <Route index element={<CaseList />} />
                <Route path="returns/:id" element={<DetailRoute />} />
              </Routes>
            </div>
          </main>
        </div>
        <footer className="shop-status" role="status">
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
  const openCount = cases.filter((c) => c.status === 'open').length
  const open = (id: string) => navigate({ pathname: `/shop/returns/${id}`, search: location.search })

  return (
    <section>
      <div className="shop-head">
        <div>
          <h1>Return requests</h1>
          <p>
            {openCount} {openCount === 1 ? 'request' : 'requests'} to process
          </p>
        </div>
      </div>
      <div className="shop-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={filter === 'open'} onClick={() => setFilter('open')}>
          To process ({openCount})
        </button>
        <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
          All ({cases.length})
        </button>
      </div>
      <div className="shop-card">
        <table className="shop-table">
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
                <td className="shop-id">{c.id}</td>
                <td>
                  <span className="shop-person">
                    <span className="shop-avatar">{initials(c.customer.name)}</span>
                    <span>
                      {c.customer.name}
                      <span className="sub">{c.customer.city}</span>
                    </span>
                  </span>
                </td>
                <td>
                  {c.item}
                  <span className="sub">{c.orderNo}</span>
                </td>
                <td>
                  <span className="shop-tag">{c.reason}</span>
                </td>
                <td>
                  {formatDate(c.delivered)}
                  <span className="sub">{ago(daysSince(c.delivered))}</span>
                </td>
                <td className="num">{formatMoney(c.price)}</td>
                <td>
                  <Badge status={c.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr className="empty">
                <td colSpan={7}>All caught up. Completed and escalated requests are under All.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
      <section className="shop-card shop-section">
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
      <Link to={{ pathname: '/shop', search: location.search }} className="shop-back">
        <BackIcon />
        Return requests
      </Link>
      <div className="shop-head">
        <div>
          <h1>
            Return {item.id}
            <Badge status={item.status} />
          </h1>
          <p>
            {item.item} · {formatMoney(item.price)}
          </p>
        </div>
        {dirty && <span className="shop-unsaved">Unsaved changes</span>}
      </div>

      <div className="shop-detail">
        <div className="shop-col">
          <div className="shop-card shop-section">
            <h2>Order</h2>
            <dl className="shop-fields">
              <dt>Order no.</dt>
              <dd>{item.orderNo}</dd>
              <dt>Item</dt>
              <dd>{item.item}</dd>
              <dt>SKU</dt>
              <dd>{item.sku}</dd>
              <dt>Price paid</dt>
              <dd>{formatMoney(item.price)}</dd>
              <dt>Delivered</dt>
              <dd>
                {formatDate(item.delivered)} by {item.carrier} ({ago(days)}, return window {RETURN_WINDOW_DAYS} days)
              </dd>
              <dt>Item opened</dt>
              <dd>{item.opened ? 'Yes' : 'No'}</dd>
              <dt>Packaging</dt>
              <dd>{item.packaging}</dd>
            </dl>
          </div>

          <div className="shop-card shop-section">
            <h2>Request</h2>
            <dl className="shop-fields">
              <dt>Reason</dt>
              <dd>
                <span className="shop-tag">{item.reason}</span>
              </dd>
            </dl>
            <p className="shop-message">{item.message}</p>
          </div>

          <div className="shop-card shop-section">
            <h2>Customer</h2>
            <div className="shop-customer">
              <span className="shop-avatar lg">{initials(item.customer.name)}</span>
              <div>
                <strong>{item.customer.name}</strong>
                <span>{item.customer.email}</span>
              </div>
            </div>
            <dl className="shop-fields">
              <dt>City</dt>
              <dd>{item.customer.city}</dd>
              <dt>Customer since</dt>
              <dd>{formatDate(item.customer.since)}</dd>
            </dl>
            <dl className="shop-stats">
              <div>
                <dt>Orders (12 months)</dt>
                <dd>{item.customer.orders12m}</dd>
              </div>
              <div>
                <dt>Returns (12 months)</dt>
                <dd>{item.customer.returns12m}</dd>
              </div>
            </dl>
          </div>

        </div>

        <div className="shop-col">
          <fieldset className="shop-card shop-section" disabled={!editable} style={{ margin: 0, minWidth: 0 }}>
            <h2>Decision</h2>
            <div className="shop-form stacked">
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
              <span className="shop-check">
                <input
                  id="restocking-fee"
                  type="checkbox"
                  checked={draft.restockingFee}
                  disabled={!refunds}
                  onChange={(e) => {
                    const fee = e.target.checked
                    const amount = fee ? item.price * (1 - RESTOCKING_FEE) : item.price
                    set({ restockingFee: fee, refundAmount: amount.toFixed(2) })
                  }}
                />
                {Math.round(RESTOCKING_FEE * 100)} % deducted from the refund
              </span>

              <label htmlFor="note">Note</label>
              <textarea id="note" rows={3} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
            </div>
          {editable && (
            <div className="shop-card-actions">
              <button type="button" className="shop-btn" disabled={!dirty} onClick={() => shop.save(item.id, draft)}>
                Save
              </button>
              <button type="button" className="shop-btn" onClick={() => setEscalating(true)}>
                Escalate to supervisor
              </button>
              <span className="spacer" />
              <button
                type="button"
                className="shop-btn primary"
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
          </fieldset>
          <div className="shop-card shop-section">
            <h2>History</h2>
            <ol className="shop-log">
              {item.log.map((entry, i) => (
                <li key={i}>
                  <time>
                    {formatDateTime(entry.at)} · {entry.user}
                  </time>
                  {entry.text}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>


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
    <dialog ref={ref} className="shop-dialog" onCancel={onCancel} aria-label={title}>
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
      <div className="shop-form">
        <label htmlFor="escalate-reason">Reason</label>
        <select id="escalate-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select…</option>
          {escalationReasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <label htmlFor="escalate-note">Note for the supervisor</label>
        <textarea id="escalate-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="shop-actions">
        <button type="button" className="shop-btn" onClick={onCancel}>
          Cancel
        </button>
        <span className="spacer" />
        <button type="button" className="shop-btn primary" disabled={!reason} onClick={() => onConfirm(reason, note.trim())}>
          Escalate
        </button>
      </div>
    </Dialog>
  )
}
