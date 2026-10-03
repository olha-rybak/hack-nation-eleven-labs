import { useState } from 'react'
import { useNavigate } from 'react-router'
import { supplierOf, totals, type Invoice } from './data'
import { formatDate, formatMoney, statusLabel } from './format'
import { useErp } from './store'

type Filter = 'open' | 'all'

const isOpen = (inv: Invoice) => inv.status === 'open' || inv.status === 'on_hold'

export function InvoiceList() {
  const { invoices } = useErp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const rows = invoices
    .filter((inv) => filter === 'all' || isOpen(inv))
    .filter((inv) => !q || [inv.id, inv.supplierRef, supplierOf(inv).name].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))

  const open = (id: string) => navigate({ pathname: `/erp/invoices/${id}`, search: location.search })

  return (
    <section>
      <div className="erp-titlebar">
        <h1>Incoming invoices</h1>
      </div>
      <div className="erp-toolbar">
        <div className="erp-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={filter === 'open'} onClick={() => setFilter('open')}>
            To process ({invoices.filter(isOpen).length})
          </button>
          <button type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
            All ({invoices.length})
          </button>
        </div>
        <label className="erp-search">
          Search
          <input id="erp-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Invoice, supplier, reference" />
        </label>
      </div>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Supplier</th>
            <th>Supplier ref.</th>
            <th>Invoice date</th>
            <th>Due date</th>
            <th className="num">Gross amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.id} onClick={() => open(inv.id)} onKeyDown={(e) => e.key === 'Enter' && open(inv.id)} tabIndex={0}>
              <td className="mono">{inv.id}</td>
              <td>{supplierOf(inv).name}</td>
              <td className="mono">{inv.supplierRef}</td>
              <td>{formatDate(inv.invoiceDate)}</td>
              <td>{formatDate(inv.dueDate)}</td>
              <td className="num">{formatMoney(totals(inv).gross)}</td>
              <td>
                <span className={`erp-status-tag ${inv.status}`}>{statusLabel[inv.status]}</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="empty">
              <td colSpan={7}>No invoices match.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  )
}
