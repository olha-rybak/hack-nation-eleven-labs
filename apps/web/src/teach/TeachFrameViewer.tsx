import { useEffect, useRef } from 'react'
import { formatTs } from '../lib/time'

/** The expert's screen moment, enlarged in a modal dialog (Escape or a click outside closes it). */
export function TeachFrameViewer({ src, ts, caption, onClose }: { src: string; ts: number; caption: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog ref={ref} className="teach-viewer" onCancel={onClose} onClick={(e) => e.target === e.currentTarget && onClose()} aria-label={`Screen moment at ${formatTs(ts)}`}>
      <figure>
        <img src={src} alt={`Expert’s screen at ${formatTs(ts)}`} />
        <figcaption>
          <time>{formatTs(ts)}</time>
          <span>{caption}</span>
          <button type="button" className="icon-button glass" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </figcaption>
      </figure>
    </dialog>
  )
}
