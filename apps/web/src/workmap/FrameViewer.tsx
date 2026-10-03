import { useEffect, useRef } from 'react'
import { formatTs } from '../lib/time'

export interface FrameMoment {
  src: string
  ts: number
  caption: string
}

export function FrameViewer({ moment, onClose }: { moment: FrameMoment; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className="wm-viewer"
      onCancel={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={`Screen moment at ${formatTs(moment.ts)}`}
    >
      <figure>
        <img src={moment.src} alt={`Expert's screen at ${formatTs(moment.ts)}`} />
        <figcaption>
          <time>{formatTs(moment.ts)}</time>
          <span>{moment.caption}</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </button>
        </figcaption>
      </figure>
    </dialog>
  )
}
