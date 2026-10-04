import { useEffect, useRef, useState, type ReactNode } from 'react'

// The session panel can sit docked beside the stage, float over it, or shrink to a pill,
// so the expert can keep the shared screen in full view.

type PanelMode = 'docked' | 'floating' | 'minimized'

interface Saved {
  mode: PanelMode
  restore: Exclude<PanelMode, 'minimized'>
  x: number | null
  y: number | null
}

const STORAGE_KEY = 'panel-window:v1'
const MARGIN = 12

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Saved
  } catch {
    // Storage blocked: start docked.
  }
  return { mode: 'docked', restore: 'docked', x: null, y: null }
}

// Past an edge the window follows less and less, then settles back inside on release.
function rubberband(value: number, min: number, max: number, size: number) {
  const band = (over: number) => (over * size * 0.55) / (size + 0.55 * over)
  if (value < min) return min - band(min - value)
  if (value > max) return max + band(value - max)
  return value
}

interface Props {
  title: string
  /** One line shown on the minimized pill. */
  summary?: string
  /** Grows with every new item; the pill counts what arrived while minimized. */
  activity?: number
  children: ReactNode
}

// Matches .panel-frame.floating in global.css.
function frameSize() {
  return { w: Math.min(380, window.innerWidth - 24), h: Math.min(680, window.innerHeight - 88) }
}

function clamp(x: number, y: number) {
  const { w, h } = frameSize()
  const maxX = Math.max(window.innerWidth - w - MARGIN, MARGIN)
  const maxY = Math.max(window.innerHeight - h - MARGIN, MARGIN)
  return { x: Math.min(Math.max(x, MARGIN), maxX), y: Math.min(Math.max(y, MARGIN), maxY), maxX, maxY, w, h }
}

export function PanelWindow({ title, summary, activity = 0, children }: Props) {
  const [saved, setSaved] = useState<Saved>(load)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [seen, setSeen] = useState(activity)
  const [, setViewport] = useState(0)
  const grab = useRef<{ dx: number; dy: number } | null>(null)
  const { mode } = saved

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // Not remembering the layout is fine.
    }
  }, [saved])

  // Re-clamp the floating window when the browser window changes size.
  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Where it was last left, or top right below the nav.
  const resting = clamp(saved.x ?? Infinity, saved.y ?? 64)
  const pos = drag ?? resting

  function setMode(next: PanelMode) {
    if (next === 'minimized') setSeen(activity)
    setSaved((s) => ({ ...s, mode: next, restore: next === 'minimized' ? (s.mode === 'minimized' ? s.restore : s.mode) : next }))
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'floating' || e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    setDrag({ x: pos.x, y: pos.y })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!grab.current) return
    const { maxX, maxY, w, h } = resting
    setDrag({
      x: rubberband(e.clientX - grab.current.dx, MARGIN, maxX, w),
      y: rubberband(e.clientY - grab.current.dy, MARGIN, maxY, h),
    })
  }

  function onPointerUp() {
    if (!grab.current || !drag) return
    grab.current = null
    const { x, y } = clamp(drag.x, drag.y)
    setSaved((s) => ({ ...s, x, y }))
    setDrag(null)
  }

  const unread = mode === 'minimized' ? Math.max(0, activity - seen) : 0
  const floating = mode === 'floating'
  const frameClass = ['panel-frame', floating && 'floating', drag && 'dragging'].filter(Boolean).join(' ')

  return (
    <>
      <div
        className={frameClass}
        hidden={mode === 'minimized'}
        style={floating ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` } : undefined}
      >
        <div
          className="panel-bar"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && setMode(floating ? 'docked' : 'floating')}
          title={floating ? 'Drag to move. Double-click to dock.' : undefined}
        >
          {floating && <span className="panel-grabber" aria-hidden="true" />}
          <span className="panel-bar-actions">
            <button
              type="button"
              className="panel-icon"
              onClick={() => setMode(floating ? 'docked' : 'floating')}
              aria-label={floating ? `Dock ${title} panel` : `Pop out ${title} panel`}
              title={floating ? 'Dock' : 'Pop out'}
            >
              {floating ? <DockIcon /> : <PopOutIcon />}
            </button>
            <button type="button" className="panel-icon" onClick={() => setMode('minimized')} aria-label={`Minimize ${title} panel`} title="Minimize">
              <MinimizeIcon />
            </button>
          </span>
        </div>
        {children}
      </div>

      {mode === 'minimized' && (
        <button type="button" className="panel-pill glass" onClick={() => setMode(saved.restore)} aria-label={`Show ${title} panel`}>
          <span className="panel-pill-title">{title}</span>
          {summary && <span className="panel-pill-summary">{summary}</span>}
          {unread > 0 && (
            <span className="panel-pill-badge" aria-label={`${unread} new`}>
              {unread}
            </span>
          )}
        </button>
      )}
    </>
  )
}

const icon = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true } as const

function PopOutIcon() {
  return (
    <svg {...icon}>
      <rect x="1.5" y="3.5" width="9" height="9" rx="2" />
      <path d="M7.5 1.5h5v5M12.5 1.5 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DockIcon() {
  return (
    <svg {...icon}>
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
      <path d="M8.5 1.5v11" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg {...icon}>
      <path d="M3 7h8" strokeLinecap="round" />
    </svg>
  )
}
