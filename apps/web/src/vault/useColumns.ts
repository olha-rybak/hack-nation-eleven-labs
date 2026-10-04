import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

const KEY = 'vault-columns'
export const DEFAULTS = { left: 268, right: 400 }
const MIN = { left: 180, right: 260, note: 380 }

type Columns = typeof DEFAULTS
export type Side = keyof Columns

function load(): Columns {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Columns> | null
    return { ...DEFAULTS, ...saved }
  } catch {
    return DEFAULTS
  }
}

// Pane widths for the three-column workspace: drag a splitter, use the arrow keys on it, or
// double-click it to reset. Widths persist per browser.
export function useColumns() {
  const [cols, setCols] = useState<Columns>(load)
  const ref = useRef<HTMLDivElement>(null)

  const set = useCallback((side: Side, width: number) => {
    setCols((c) => {
      const total = ref.current?.clientWidth ?? window.innerWidth
      const other = side === 'left' ? c.right : c.left
      const max = Math.max(MIN[side], total - other - MIN.note)
      return { ...c, [side]: Math.round(Math.min(Math.max(width, MIN[side]), max)) }
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cols))
    } catch {
      // Private mode: widths just don't persist.
    }
  }, [cols])

  const style = { '--v-left': `${cols.left}px`, '--v-right': `${cols.right}px` } as CSSProperties
  return { ref, cols, set, style }
}
