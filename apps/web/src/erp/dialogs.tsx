import { useEffect, useRef, useState, type ReactNode } from 'react'
import { assetsUnderConstruction } from './data'
import { holdReasons } from './store'

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

export function HoldDialog({
  invoiceId,
  onCancel,
  onConfirm,
}: {
  invoiceId: string
  onCancel: () => void
  onConfirm: (reason: string, note: string) => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  return (
    <Dialog title={`Put ${invoiceId} on hold`} onCancel={onCancel}>
      <div className="erp-form">
        <label htmlFor="hold-reason">Reason</label>
        <select id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select…</option>
          {holdReasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <label htmlFor="hold-note">Note</label>
        <textarea id="hold-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="erp-actions in-dialog">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <span className="spacer" />
        <button type="button" className="primary" disabled={!reason} onClick={() => onConfirm(reason, note.trim())}>
          Put on hold
        </button>
      </div>
    </Dialog>
  )
}

export function AssetLookupDialog({ onCancel, onSelect }: { onCancel: () => void; onSelect: (number: string) => void }) {
  return (
    <Dialog title="Assets under construction" onCancel={onCancel}>
      <table className="erp-table compact">
        <thead>
          <tr>
            <th>Asset number</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {assetsUnderConstruction.map((asset) => (
            <tr key={asset.number} onClick={() => onSelect(asset.number)} onKeyDown={(e) => e.key === 'Enter' && onSelect(asset.number)} tabIndex={0}>
              <td className="mono">{asset.number}</td>
              <td>{asset.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="erp-actions in-dialog">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Dialog>
  )
}
