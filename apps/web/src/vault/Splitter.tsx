import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { DEFAULTS, type Side } from './useColumns'

interface Props {
  side: Side
  width: number
  onResize: (side: Side, width: number) => void
}

export function Splitter({ side, width, onResize }: Props) {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, width: 0 })

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, width }
    setDragging(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const dx = e.clientX - start.current.x
    onResize(side, start.current.width + (side === 'left' ? dx : -dx))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
    if (e.key === grow) onResize(side, width + step)
    else if (e.key === shrink) onResize(side, width - step)
    else return
    e.preventDefault()
  }

  useEffect(() => {
    document.body.classList.toggle('v-resizing', dragging)
    return () => document.body.classList.remove('v-resizing')
  }, [dragging])

  return (
    <div
      className={`v-split v-split-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize file list' : 'Resize graph'}
      aria-valuenow={width}
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => onResize(side, DEFAULTS[side])}
      onKeyDown={onKeyDown}
    />
  )
}
