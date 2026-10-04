import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { approvers, costCenters, supplierOf, totals, type Invoice } from './data'
import { AssetLookupDialog, HoldDialog } from './dialogs'
import { formatDate, formatDateTime, formatMoney, statusLabel } from './format'
import { useErp, type Draft } from './store'

const draftOf = (inv: Invoice): Draft => ({
  costCenter: inv.costCenter,
  assetNumber: inv.assetNumber,
  comment: inv.comment,
  approvers: inv.approvers,
})

export function InvoiceDetail({ id }: { id: string }) {
  const erp = useErp()
  const invoice = erp.invoices.find((inv) => inv.id === id)
  const [draft, setDraft] = useState<Draft | null>(invoice ? draftOf(invoice) : null)
  const [dialog, setDialog] = useState<'hold' | 'asset' | null>(null)
  const navigate = useNavigate()

  if (!invoice || !draft) {
    return (
      <section className="erp-panel">
        <p>Invoice {id} does not exist.</p>
        <Link to={{ pathname: '/erp', search: location.search }}>Back to incoming invoices</Link>
      </section>
    )
  }

  const supplier = supplierOf(invoice)
  const sums = totals(invoice)
  const editable = invoice.status === 'open' || invoice.status === 'on_hold'
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(invoice))
  const others = erp.invoices
    .filter((inv) => inv.supplierId === invoice.supplierId && inv.id !== invoice.id)
    .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const toList = () => navigate({ pathname: '/erp', search: location.search })
  const toInvoice = (other: string) => navigate({ pathname: `/erp/invoices/${other}`, search: location.search })
  const addable = approvers.filter((a) => !draft.approvers.includes(a.name))

  return (
    <section>
      <div className="erp-titlebar">
        <Link to={{ pathname: '/erp', search: location.search }} className="erp-back">
          Incoming invoices
        </Link>
        <h1>
          Invoice {invoice.id}
          <span className={`erp-status-tag ${invoice.status}`}>{statusLabel[invoice.status]}</span>
        </h1>
        {dirty && <span className="erp-unsaved">Unsaved changes</span>}
      </div>

      <div className="erp-detail">
        <div className="erp-col">
          <fieldset className="erp-panel">
            <legend>Invoice data</legend>
            <dl className="erp-fields">
              <dt>Supplier</dt>
              <dd>{supplier.name}</dd>
              <dt>Supplier invoice no.</dt>
              <dd className="mono">{invoice.supplierRef}</dd>
              <dt>Invoice date</dt>
              <dd>{formatDate(invoice.invoiceDate)}</dd>
              <dt>Received</dt>
              <dd>{formatDate(invoice.receivedDate)}</dd>
              <dt>Due date</dt>
              <dd>{formatDate(invoice.dueDate)}</dd>
              <dt>Purchase order</dt>
              <dd className="mono">{invoice.poNumber ?? 'none'}</dd>
              {invoice.documentNo && (
                <>
                  <dt>Document no.</dt>
                  <dd className="mono">{invoice.documentNo}</dd>
                </>
              )}
            </dl>
          </fieldset>

          <fieldset className="erp-panel">
            <legend>Line items</legend>
            <table className="erp-table compact">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, i) => (
                  <tr key={i}>
                    <td>{(i + 1) * 10}</td>
                    <td>{line.description}</td>
                    <td className="num">
                      {line.qty} {line.unit}
                    </td>
                    <td className="num">{formatMoney(line.unitPrice)}</td>
                    <td className="num">{formatMoney(line.qty * line.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="erp-totals">
              <dt>Net</dt>
              <dd>{formatMoney(sums.net)}</dd>
              <dt>VAT {Math.round(invoice.vatRate * 100)} %{invoice.vatNote ? ` (${invoice.vatNote})` : ''}</dt>
              <dd>{formatMoney(sums.vat)}</dd>
              <dt className="strong">Gross</dt>
              <dd className="strong">{formatMoney(sums.gross)}</dd>
            </dl>
          </fieldset>

          <fieldset className="erp-panel" disabled={!editable}>
            <legend>Account assignment</legend>
            <div className="erp-form">
              <label htmlFor="cost-center">Cost center</label>
              <select id="cost-center" value={draft.costCenter} onChange={(e) => set({ costCenter: e.target.value })}>
                {costCenters.map((cc) => (
                  <option key={cc.code} value={cc.code}>
                    {cc.code} {cc.name}
                  </option>
                ))}
              </select>

              <label htmlFor="asset-number">Asset number</label>
              <div className="erp-inline">
                <input
                  id="asset-number"
                  value={draft.assetNumber}
                  onChange={(e) => set({ assetNumber: e.target.value.toUpperCase() })}
                  placeholder="AN-00000"
                />
                <button type="button" onClick={() => setDialog('asset')}>
                  Find
                </button>
              </div>

              <label htmlFor="comment">Comment</label>
              <textarea id="comment" rows={2} value={draft.comment} onChange={(e) => set({ comment: e.target.value })} />
            </div>
          </fieldset>

          <fieldset className="erp-panel" disabled={!editable}>
            <legend>Approval</legend>
            <ol className="erp-approvers">
              {draft.approvers.map((name, i) => (
                <li key={name}>
                  <span>
                    {i + 1}. {name}
                    <span className="muted"> · {approvers.find((a) => a.name === name)?.role}</span>
                  </span>
                  {draft.approvers.length > 1 && (
                    <button type="button" className="erp-link-button" onClick={() => set({ approvers: draft.approvers.filter((a) => a !== name) })}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {addable.length > 0 && (
              <div className="erp-inline">
                <label htmlFor="add-approver">Add approver</label>
                <select
                  id="add-approver"
                  value=""
                  onChange={(e) => e.target.value && set({ approvers: [...draft.approvers, e.target.value] })}
                >
                  <option value="">Select…</option>
                  {addable.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}, {a.role}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
        </div>

        <div className="erp-col side">
          <fieldset className="erp-panel">
            <legend>Supplier</legend>
            <dl className="erp-fields">
              <dt>Name</dt>
              <dd>
                {supplier.vendorNo ? (
                  <Link to={{ pathname: `/erp/vendors/${supplier.id}`, search: location.search }}>{supplier.name}</Link>
                ) : (
                  supplier.name
                )}
              </dd>
              <dt>Address</dt>
              <dd>
                {supplier.street}, {supplier.city}
              </dd>
              <dt>Country</dt>
              <dd>{supplier.country}</dd>
              <dt>VAT id</dt>
              <dd className="mono">{supplier.vatId}</dd>
              <dt>Vendor no.</dt>
              <dd className="mono">{supplier.vendorNo ?? 'not in vendor master'}</dd>
              <dt>Group company</dt>
              <dd>{supplier.groupCompany ?? 'No'}</dd>
              <dt>Vendor since</dt>
              <dd>{supplier.since ? formatDate(supplier.since) : 'n/a'}</dd>
            </dl>
          </fieldset>

          <fieldset className="erp-panel">
            <legend>Other invoices from this supplier</legend>
            {others.length === 0 ? (
              <p className="muted">None.</p>
            ) : (
              <table className="erp-table compact">
                <tbody>
                  {others.map((o) => (
                    <tr key={o.id} onClick={() => toInvoice(o.id)} onKeyDown={(e) => e.key === 'Enter' && toInvoice(o.id)} tabIndex={0}>
                      <td className="mono">{o.id}</td>
                      <td>{formatDate(o.invoiceDate)}</td>
                      <td>{o.lines[0].description}</td>
                      <td className="num">{formatMoney(totals(o).gross)}</td>
                      <td>{statusLabel[o.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </fieldset>

          <fieldset className="erp-panel">
            <legend>History</legend>
            <ol className="erp-log">
              {invoice.log.map((entry, i) => (
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
          <button type="button" disabled={!dirty} onClick={() => erp.save(invoice.id, draft)}>
            Save
          </button>
          {invoice.status === 'on_hold' ? (
            <button type="button" onClick={() => erp.release(invoice.id, draft)}>
              Release hold
            </button>
          ) : (
            <button type="button" onClick={() => setDialog('hold')}>
              Put on hold
            </button>
          )}
          <span className="spacer" />
          <button
            type="button"
            onClick={() => {
              erp.sendForApproval(invoice.id, draft)
              toList()
            }}
          >
            Send for approval
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              erp.post(invoice.id, draft)
              toList()
            }}
          >
            Post
          </button>
        </div>
      )}

      {dialog === 'hold' && (
        <HoldDialog
          invoiceId={invoice.id}
          onCancel={() => setDialog(null)}
          onConfirm={(reason, note) => {
            erp.hold(invoice.id, draft, reason, note)
            setDialog(null)
            toList()
          }}
        />
      )}
      {dialog === 'asset' && (
        <AssetLookupDialog
          onCancel={() => setDialog(null)}
          onSelect={(number) => {
            set({ assetNumber: number })
            setDialog(null)
          }}
        />
      )}
    </section>
  )
}
