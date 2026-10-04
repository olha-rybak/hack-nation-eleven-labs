// The secondary modules: read-only views a clerk opens to look things up while
// processing an invoice. Like the rest of the ERP, they state facts, never rules.

import { Link, useNavigate } from 'react-router'
import { costCenters, suppliers, supplierOf, totals, type Invoice } from './data'
import { formatDate, formatMoney, statusLabel } from './format'
import { useErp } from './store'

const keep = (pathname: string) => ({ pathname, search: location.search })

function useOpen() {
  const navigate = useNavigate()
  return (pathname: string) => navigate(keep(pathname))
}

function rowProps(onOpen: () => void) {
  return { onClick: onOpen, onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && onOpen(), tabIndex: 0 }
}

export function Payments() {
  const { invoices } = useErp()
  const open = useOpen()
  const rows = invoices
    .filter((inv) => inv.status === 'posted' || inv.status === 'paid')
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const scheduled = rows.filter((inv) => inv.status === 'posted')

  return (
    <section>
      <div className="erp-titlebar">
        <h1>Payments</h1>
      </div>
      <p className="erp-summary">
        Next payment run: {scheduled.length} {scheduled.length === 1 ? 'invoice' : 'invoices'},{' '}
        {formatMoney(scheduled.reduce((sum, inv) => sum + totals(inv).gross, 0))}
      </p>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Document no.</th>
            <th>Invoice</th>
            <th>Supplier</th>
            <th>Due date</th>
            <th className="num">Amount</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.id} {...rowProps(() => open(`/erp/invoices/${inv.id}`))}>
              <td className="mono">{inv.documentNo}</td>
              <td className="mono">{inv.id}</td>
              <td>{supplierOf(inv).name}</td>
              <td>{formatDate(inv.dueDate)}</td>
              <td className="num">{formatMoney(totals(inv).gross)}</td>
              <td>{inv.status === 'paid' ? 'Paid' : 'Scheduled'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// Only suppliers with a vendor number are in the master; the rest arrive by e-invoice import.
const vendors = suppliers.filter((s) => s.vendorNo)

export function VendorList() {
  const { invoices } = useErp()
  const open = useOpen()
  return (
    <section>
      <div className="erp-titlebar">
        <h1>Vendor master</h1>
      </div>
      <table className="erp-table">
        <thead>
          <tr>
            <th>Vendor no.</th>
            <th>Name</th>
            <th>City</th>
            <th>Country</th>
            <th>VAT id</th>
            <th>Group company</th>
            <th className="num">Invoices</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((s) => (
            <tr key={s.id} {...rowProps(() => open(`/erp/vendors/${s.id}`))}>
              <td className="mono">{s.vendorNo}</td>
              <td>{s.name}</td>
              <td>{s.city}</td>
              <td>{s.country}</td>
              <td className="mono">{s.vatId}</td>
              <td>{s.groupCompany ?? 'No'}</td>
              <td className="num">{invoices.filter((inv) => inv.supplierId === s.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function VendorDetail({ id }: { id: string }) {
  const { invoices } = useErp()
  const open = useOpen()
  const vendor = vendors.find((s) => s.id === id)
  if (!vendor) {
    return (
      <section className="erp-panel">
        <p>Vendor {id} is not in the vendor master.</p>
        <Link to={keep('/erp/vendors')}>Back to vendor master</Link>
      </section>
    )
  }
  const own = invoices.filter((inv) => inv.supplierId === id).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))

  return (
    <section>
      <div className="erp-titlebar">
        <Link to={keep('/erp/vendors')} className="erp-back">
          Vendor master
        </Link>
        <h1>
          {vendor.name} <span className="mono muted">{vendor.vendorNo}</span>
        </h1>
      </div>
      <div className="erp-detail">
        <fieldset className="erp-panel">
          <legend>Invoices</legend>
          <table className="erp-table compact">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {own.map((inv) => (
                <tr key={inv.id} {...rowProps(() => open(`/erp/invoices/${inv.id}`))}>
                  <td className="mono">{inv.id}</td>
                  <td>{formatDate(inv.invoiceDate)}</td>
                  <td>{inv.lines[0].description}</td>
                  <td className="num">{formatMoney(totals(inv).gross)}</td>
                  <td>
                    <span className={`erp-status-tag ${inv.status}`}>{statusLabel[inv.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
        <fieldset className="erp-panel">
          <legend>Master data</legend>
          <dl className="erp-fields">
            <dt>Address</dt>
            <dd>
              {vendor.street}, {vendor.city}
            </dd>
            <dt>Country</dt>
            <dd>{vendor.country}</dd>
            <dt>VAT id</dt>
            <dd className="mono">{vendor.vatId}</dd>
            <dt>Group company</dt>
            <dd>{vendor.groupCompany ?? 'No'}</dd>
            <dt>Vendor since</dt>
            <dd>{vendor.since ? formatDate(vendor.since) : 'n/a'}</dd>
          </dl>
        </fieldset>
      </div>
    </section>
  )
}

const isBooked = (inv: Invoice) => inv.status === 'posted' || inv.status === 'paid'

export function Reports() {
  const { invoices } = useErp()
  const booked = invoices.filter(isBooked)
  const outstanding = invoices.filter((inv) => !isBooked(inv))
  const net = (list: Invoice[]) => list.reduce((sum, inv) => sum + totals(inv).net, 0)
  const rows = costCenters
    .map((cc) => ({ ...cc, list: booked.filter((inv) => inv.costCenter === cc.code) }))
    .filter((r) => r.list.length > 0)

  return (
    <section>
      <div className="erp-titlebar">
        <h1>Reports</h1>
      </div>
      <p className="erp-summary">
        Not yet posted: {outstanding.length} {outstanding.length === 1 ? 'invoice' : 'invoices'}, {formatMoney(net(outstanding))} net
      </p>
      <fieldset className="erp-panel">
        <legend>Posted spend by cost center</legend>
        <table className="erp-table compact">
          <thead>
            <tr>
              <th>Cost center</th>
              <th className="num">Invoices</th>
              <th className="num">Net amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>
                  {r.code} {r.name}
                </td>
                <td className="num">{r.list.length}</td>
                <td className="num">{formatMoney(net(r.list))}</td>
              </tr>
            ))}
            <tr>
              <td className="strong">Total</td>
              <td className="num strong">{booked.length}</td>
              <td className="num strong">{formatMoney(net(booked))}</td>
            </tr>
          </tbody>
        </table>
      </fieldset>
    </section>
  )
}
