import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The session panel can sit docked beside the stage, float over it, shrink to a pill, or move
// into a window of its own so it stays visible when the expert switches tabs or desktops.

type PanelMode = 'docked' | 'floating' | 'minimized' | 'window'
type Restore = 'docked' | 'floating'
type Rect = { x: number; y: number; w: number; h: number }

interface Saved {
  mode: PanelMode
  restore: Restore
  x: number | null
  y: number | null
  w: number | null
  h: number | null
}

const STORAGE_KEY = 'panel-window:v2'
const MARGIN = 12
const MIN_W = 300
const MIN_H = 360
const DEFAULT_W = 380
const DEFAULT_H = 680

function load(): Saved {
  const fallback: Saved = { mode: 'docked', restore: 'docked', x: null, y: null, w: null, h: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const saved = { ...fallback, ...(JSON.parse(raw) as Partial<Saved>) }
    // A separate window cannot be reopened without a click.
    return saved.mode === 'window' ? { ...saved, mode: saved.restore } : saved
  } catch {
    return fallback
  }
}

const between = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

// Size and position kept inside the browser window.
function fit(r: Rect): Rect & { maxX: number; maxY: number } {
  const w = between(r.w, MIN_W, window.innerWidth - 2 * MARGIN)
  const h = between(r.h, MIN_H, window.innerHeight - 2 * MARGIN)
  const maxX = window.innerWidth - w - MARGIN
  const maxY = window.innerHeight - h - MARGIN
  return { x: between(r.x, MARGIN, maxX), y: between(r.y, MARGIN, maxY), w, h, maxX, maxY }
}

// Past an edge the window follows less and less, then settles back inside on release.
function rubberband(value: number, min: number, max: number, size: number) {
  const band = (over: number) => (over * size * 0.55) / (size + 0.55 * over)
  if (value < min) return min - band(min - value)
  if (value > max) return max + band(value - max)
  return value
}

declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<Window> }
  }
}

/**
 * Chrome and Edge give an always-on-top picture-in-picture window. Safari and Firefox
 * get a small popup window, which stays open across tabs and can go to another desktop.
 */
async function openOwnWindow(title: string, w: number, h: number): Promise<Window | null> {
  let win: Window | null = null
  if (window.documentPictureInPicture) {
    try {
      win = await window.documentPictureInPicture.requestWindow({ width: w, height: h })
    } catch {
      win = null
    }
  }
  if (!win) {
    const left = Math.max(0, screen.availWidth - w - 24)
    win = window.open('', 'apprentice-panel', `popup,width=${w},height=${h},left=${left},top=80`)
  }
  if (!win) return null
  const doc = win.document
  doc.title = title
  doc.head.querySelectorAll('[data-panel-copy]').forEach((n) => n.remove())
  for (const node of document.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]')) {
    const copy = node.cloneNode(true) as HTMLElement
    if (node instanceof HTMLLinkElement) (copy as HTMLLinkElement).href = node.href
    copy.dataset.panelCopy = ''
    doc.head.append(copy)
  }
  doc.body.className = 'panel-window-body'
  doc.body.replaceChildren()
  return win
}

interface Props {
  title: string
  /** One line shown on the minimized pill. */
  summary?: string
  /** Grows with every new item; the pill counts what arrived while minimized. */
  activity?: number
  children: ReactNode
}

export function PanelWindow({ title, summary, activity = 0, children }: Props) {
  const [saved, setSaved] = useState<Saved>(load)
  const [live, setLive] = useState<Rect | null>(null)
  const [seen, setSeen] = useState(activity)
  const [own, setOwn] = useState<{ win: Window; root: HTMLElement } | null>(null)
  const [, setViewport] = useState(0)
  const gesture = useRef<{ kind: 'move' | 'se' | 'sw'; px: number; py: number; from: Rect } | null>(null)
  const { mode } = saved

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // Not remembering the layout is fine.
    }
  }, [saved])

  // Re-fit the floating window when the browser window changes size.
  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Keep the separate window in the page's theme, and bring the panel back when it closes.
  useEffect(() => {
    if (!own) return
    const { win } = own
    const html = win.document.documentElement
    const sync = () => {
      const theme = document.documentElement.getAttribute('data-theme')
      if (theme) html.setAttribute('data-theme', theme)
      else html.removeAttribute('data-theme')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const back = () => {
      setOwn(null)
      setSaved((s) => (s.mode === 'window' ? { ...s, mode: s.restore } : s))
    }
    win.addEventListener('pagehide', back)
    const poll = setInterval(() => win.closed && back(), 500)
    const closeWithPage = () => win.close()
    window.addEventListener('pagehide', closeWithPage)
    return () => {
      observer.disconnect()
      clearInterval(poll)
      win.removeEventListener('pagehide', back)
      window.removeEventListener('pagehide', closeWithPage)
    }
  }, [own])

  // Close the separate window when leaving the page, e.g. after End task.
  const ownRef = useRef(own)
  useEffect(() => {
    ownRef.current = own
  }, [own])
  useEffect(() => () => ownRef.current?.win.close(), [])

  // Where it was last left, or top right below the nav.
  const resting = fit({ x: saved.x ?? Infinity, y: saved.y ?? 64, w: saved.w ?? DEFAULT_W, h: saved.h ?? Math.min(DEFAULT_H, window.innerHeight - 88) })
  const rect = live ?? resting

  function setMode(next: PanelMode) {
    if (next === 'minimized') setSeen(activity)
    setSaved((s) => ({
      ...s,
      mode: next,
      restore: next === 'docked' || next === 'floating' ? next : s.mode === 'docked' || s.mode === 'floating' ? s.mode : s.restore,
    }))
  }

  async function openSeparate() {
    const win = await openOwnWindow(title, Math.round(rect.w), Math.round(rect.h))
    if (!win) return
    const root = win.document.createElement('div')
    win.document.body.append(root)
    setOwn({ win, root })
    setMode('window')
  }

  function bringBack() {
    own?.win.close()
    setOwn(null)
    setSaved((s) => ({ ...s, mode: s.restore }))
  }

  function start(kind: 'move' | 'se' | 'sw', e: React.PointerEvent<HTMLElement>) {
    if (mode !== 'floating' || e.button !== 0 || (kind === 'move' && (e.target as HTMLElement).closest('button'))) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    gesture.current = { kind, px: e.clientX, py: e.clientY, from: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } }
    setLive({ x: rect.x, y: rect.y, w: rect.w, h: rect.h })
  }

  function move(e: React.PointerEvent<HTMLElement>) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.px
    const dy = e.clientY - g.py
    const { from } = g
    if (g.kind === 'move') {
      setLive({
        ...from,
        x: rubberband(from.x + dx, MARGIN, resting.maxX, from.w),
        y: rubberband(from.y + dy, MARGIN, resting.maxY, from.h),
      })
      return
    }
    const h = between(from.h + dy, MIN_H, window.innerHeight - MARGIN - from.y)
    if (g.kind === 'se') {
      setLive({ ...from, h, w: between(from.w + dx, MIN_W, window.innerWidth - MARGIN - from.x) })
    } else {
      // The left corner moves the left edge; the right edge stays put.
      const right = from.x + from.w
      const x = between(from.x + dx, MARGIN, right - MIN_W)
      setLive({ ...from, h, x, w: right - x })
    }
  }

  function end() {
    if (!gesture.current || !live) return
    gesture.current = null
    const { x, y, w, h } = fit(live)
    setSaved((s) => ({ ...s, x, y, w, h }))
    setLive(null)
  }

  const handlers = (kind: 'move' | 'se' | 'sw') => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => start(kind, e),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  })

  const unread = mode === 'minimized' ? Math.max(0, activity - seen) : 0
  const floating = mode === 'floating'
  const inOwn = mode === 'window' && own !== null
  const canOpenOwn = typeof window.open === 'function'
  const frameClass = ['panel-frame', floating && 'floating', inOwn && 'own-window', live && 'dragging'].filter(Boolean).join(' ')

  const frame = (
    <div
      className={frameClass}
      hidden={mode === 'minimized' || (mode === 'window' && !inOwn)}
      style={floating ? { transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`, width: rect.w, height: rect.h } : undefined}
    >
      <div
        className="panel-bar"
        {...handlers('move')}
        onDoubleClick={(e) => floating && !(e.target as HTMLElement).closest('button') && setMode('docked')}
        title={floating ? 'Drag to move. Double-click to dock.' : undefined}
      >
        {floating && <span className="panel-grabber" aria-hidden="true" />}
        <span className="panel-bar-actions">
          {inOwn ? (
            <button type="button" className="panel-icon" onClick={bringBack} aria-label={`Bring ${title} panel back to the page`} title="Back to the page">
              <DockIcon />
            </button>
          ) : (
            <>
              {canOpenOwn && (
                <button
                  type="button"
                  className="panel-icon"
                  onClick={openSeparate}
                  aria-label={`Open ${title} panel in its own window`}
                  title="Own window: stays visible in other tabs"
                >
                  <OwnWindowIcon />
                </button>
              )}
              <button
                type="button"
                className="panel-icon"
                onClick={() => setMode(floating ? 'docked' : 'floating')}
                aria-label={floating ? `Dock ${title} panel` : `Float ${title} panel over the page`}
                title={floating ? 'Dock' : 'Float over the page'}
              >
                {floating ? <DockIcon /> : <FloatIcon />}
              </button>
              <button type="button" className="panel-icon" onClick={() => setMode('minimized')} aria-label={`Minimize ${title} panel`} title="Minimize">
                <MinimizeIcon />
              </button>
            </>
          )}
        </span>
      </div>
      {children}
      {floating && (
        <>
          <span className="panel-resize se" aria-hidden="true" {...handlers('se')} />
          <span className="panel-resize sw" aria-hidden="true" {...handlers('sw')} />
        </>
      )}
    </div>
  )

  return (
    <>
      {own && mode === 'window' ? createPortal(frame, own.root) : frame}

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

      {inOwn && (
        <button type="button" className="panel-pill glass" onClick={bringBack}>
          <span className="panel-pill-title">{title}</span>
          <span className="panel-pill-summary">In its own window</span>
          <span className="panel-pill-action">Bring back</span>
        </button>
      )}
    </>
  )
}

const icon = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true } as const

function OwnWindowIcon() {
  return (
    <svg {...icon}>
      <rect x="1.5" y="3.5" width="9" height="9" rx="2" />
      <path d="M7.5 1.5h5v5M12.5 1.5 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FloatIcon() {
  return (
    <svg {...icon}>
      <rect x="1.5" y="1.5" width="11" height="11" rx="2" />
      <rect x="6" y="6" width="5" height="5" rx="1" />
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
