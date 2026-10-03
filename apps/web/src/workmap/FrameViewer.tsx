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
          <button type="button" className="button secondary small" onClick={onClose}>
            Close
          </button>
        </figcaption>
      </figure>
    </dialog>
  )
}
