import type { GraphEdge, GraphNode, NoteKind } from './notes'

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number // fade, 0..1
  want: boolean
  fixed: boolean
}

interface View {
  x: number
  y: number
  k: number
}

export interface GraphEngine {
  sync: (activeId: string, local: boolean) => void
  resetView: () => void
  destroy: () => void
}

export const kindColorVar: Record<NoteKind, string> = {
  index: '--g-index',
  step: '--g-step',
  judgment: '--g-judgment',
  stop: '--g-stop',
  guardrail: '--g-guardrail',
  question: '--g-question',
}

const REPULSION = 7000
const SPRING = 0.04
const REST = 120
const CENTER = 0.012
const DAMPING = 0.82

export function createGraphEngine(
  canvas: HTMLCanvasElement,
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  onOpen: (id: string) => void,
): GraphEngine {
  const ctx = canvas.getContext('2d')!
  const adj = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set()]))
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }
  const nodes: SimNode[] = graph.nodes.map((n, i) => {
    const angle = (i / graph.nodes.length) * Math.PI * 2
    const deg = adj.get(n.id)!.size
    return { ...n, x: Math.cos(angle) * 140, y: Math.sin(angle) * 140, vx: 0, vy: 0, r: 5 + Math.sqrt(deg) * 2.2, a: 0, want: true, fixed: false }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = graph.edges.flatMap((e) => {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    return a && b ? [{ a, b }] : []
  })

  let view: View = { x: 0, y: 0, k: 1 }
  let goal: View = { ...view }
  // Until the user zooms or pans, keep the whole graph framed in the pane.
  let autoFit = true
  let active = ''
  let local = false
  let hover: SimNode | null = null
  let drag: { node: SimNode; startX: number; startY: number; moved: boolean } | null = null
  let pan: { px: number; py: number; vx: number; vy: number } | null = null
  let w = 0
  let h = 0
  let dpr = 1
  let raf = 0
  let dead = false

  const screenR = (n: SimNode) => n.r * Math.max(0.7, Math.min(view.k, 2))
  const toWorld = (px: number, py: number) => ({ x: (px - w / 2 - view.x) / view.k, y: (py - h / 2 - view.y) / view.k })

  function step(): boolean {
    let moving = false
    const live = nodes.filter((n) => n.want)
    for (const n of nodes) {
      const to = n.want ? 1 : 0
      if (n.a !== to) {
        n.a += (to - n.a) * 0.16
        if (Math.abs(to - n.a) < 0.01) n.a = to
        else moving = true
      }
    }
    for (let i = 0; i < live.length; i++) {
      const p = live[i]!
      for (let j = i + 1; j < live.length; j++) {
        const q = live[j]!
        const dx = p.x - q.x
        const dy = p.y - q.y
        const d2 = Math.max(dx * dx + dy * dy, 25)
        const d = Math.sqrt(d2)
        const f = REPULSION / d2
        p.vx += (dx / d) * f
        p.vy += (dy / d) * f
        q.vx -= (dx / d) * f
        q.vy -= (dy / d) * f
      }
    }
    for (const { a, b } of edges) {
      if (!a.want || !b.want) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(Math.hypot(dx, dy), 1)
      const f = (d - REST) * SPRING
      a.vx += (dx / d) * f
      a.vy += (dy / d) * f
      b.vx -= (dx / d) * f
      b.vy -= (dy / d) * f
    }
    if (autoFit && live.length && w && h) fit(live)
    let energy = 0
    for (const n of live) {
      n.vx = (n.vx - n.x * CENTER) * DAMPING
      n.vy = (n.vy - n.y * CENTER) * DAMPING
      if (n.fixed) {
        n.vx = 0
        n.vy = 0
        continue
      }
      n.x += n.vx
      n.y += n.vy
      energy += n.vx * n.vx + n.vy * n.vy
    }
    if (energy > 0.01) moving = true

    for (const key of ['x', 'y', 'k'] as const) {
      const diff = goal[key] - view[key]
      if (Math.abs(diff) > 0.002) {
        view[key] += diff * 0.2
        moving = true
      } else view[key] = goal[key]
    }
    return moving
  }

  function fit(live: SimNode[]) {
    const xs = live.map((n) => n.x)
    const ys = live.map((n) => n.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    // Horizontal room for labels, vertical room for the label under the lowest node.
    const k = Math.min(2.2, (w - 140) / Math.max(x1 - x0, 1), (h - 120) / Math.max(y1 - y0, 1))
    goal = { k: Math.max(0.3, k), x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k }
  }

  function draw() {
    const cs = getComputedStyle(canvas)
    const color = (name: string) => cs.getPropertyValue(name).trim()
    const accent = color('--accent')
    const edgeColor = color('--g-edge')
    const labelColor = color('--g-label')
    const halo = color('--g-halo')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const sx = (x: number) => x * view.k + view.x + w / 2
    const sy = (y: number) => y * view.k + view.y + h / 2

    const focus = hover?.id ?? null
    const near = focus ? adj.get(focus)! : null
    const activeNear = adj.get(active)
    const dimmed = (n: SimNode) => focus !== null && n.id !== focus && !near!.has(n.id)

    ctx.lineWidth = 1
    for (const { a, b } of edges) {
      const fade = Math.min(a.a, b.a)
      if (fade <= 0) continue
      const lit = focus !== null && (a.id === focus || b.id === focus)
      ctx.globalAlpha = fade * (focus !== null && !lit ? 0.12 : 1)
      ctx.strokeStyle = lit || (focus === null && (a.id === active || b.id === active)) ? accent : edgeColor
      ctx.beginPath()
      ctx.moveTo(sx(a.x), sy(a.y))
      ctx.lineTo(sx(b.x), sy(b.y))
      ctx.stroke()
    }

    for (const n of nodes) {
      if (n.a <= 0) continue
      const x = sx(n.x)
      const y = sy(n.y)
      const r = screenR(n) * (0.4 + 0.6 * n.a)
      ctx.globalAlpha = n.a * (dimmed(n) ? 0.22 : 1)
      if (n.id === active) {
        ctx.beginPath()
        ctx.arc(x, y, r + 6, 0, Math.PI * 2)
        ctx.fillStyle = halo
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = accent
        ctx.beginPath()
        ctx.arc(x, y, r + 3.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = color(kindColorVar[n.kind])
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.font = '500 11px system-ui, -apple-system, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    for (const n of nodes) {
      if (n.a < 0.5) continue
      const show =
        n.id === focus || n.id === active || (focus === null && activeNear?.has(n.id)) || near?.has(n.id) || view.k > 1.6
      if (!show || dimmed(n)) continue
      const label = n.title.length > 30 ? `${n.title.slice(0, 29)}…` : n.title
      // Keep labels near the pane edge fully inside the canvas.
      const half = ctx.measureText(label).width / 2 + 4
      const x = Math.min(Math.max(sx(n.x), half), w - half)
      const y = sy(n.y) + screenR(n) + 4
      ctx.globalAlpha = n.a
      ctx.strokeStyle = halo
      ctx.strokeText(label, x, y)
      ctx.fillStyle = labelColor
      ctx.fillText(label, x, y)
    }
    ctx.globalAlpha = 1
  }

  function frame() {
    raf = 0
    if (dead) return
    const moving = step()
    draw()
    if (moving || drag) raf = requestAnimationFrame(frame)
  }

  const wake = () => {
    if (!raf && !dead) raf = requestAnimationFrame(frame)
  }

  function hit(px: number, py: number): SimNode | null {
    const p = toWorld(px, py)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]!
      if (n.a < 0.5) continue
      const slack = (screenR(n) + 4) / view.k
      if (Math.hypot(n.x - p.x, n.y - p.y) <= slack) return n
    }
    return null
  }

  const pos = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { px: e.clientX - rect.left, py: e.clientY - rect.top }
  }

  const onDown = (e: PointerEvent) => {
    const { px, py } = pos(e)
    canvas.setPointerCapture(e.pointerId)
    const node = hit(px, py)
    if (node) {
      node.fixed = true
      drag = { node, startX: px, startY: py, moved: false }
    } else {
      pan = { px, py, vx: view.x, vy: view.y }
      canvas.style.cursor = 'grabbing'
    }
    wake()
  }

  const onMove = (e: PointerEvent) => {
    const { px, py } = pos(e)
    if (drag) {
      if (Math.hypot(px - drag.startX, py - drag.startY) > 3) drag.moved = true
      const p = toWorld(px, py)
      drag.node.x = p.x
      drag.node.y = p.y
      drag.node.vx = 0
      drag.node.vy = 0
    } else if (pan) {
      autoFit = false
      view.x = goal.x = pan.vx + px - pan.px
      view.y = goal.y = pan.vy + py - pan.py
    } else {
      const next = hit(px, py)
      if (next === hover) return
      hover = next
      canvas.style.cursor = next ? 'pointer' : 'grab'
    }
    wake()
  }

  const onUp = (e: PointerEvent) => {
    if (drag) {
      drag.node.fixed = false
      if (!drag.moved) onOpen(drag.node.id)
      drag = null
    }
    pan = null
    canvas.style.cursor = hover ? 'pointer' : 'grab'
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    wake()
  }

  const onLeave = () => {
    if (!hover) return
    hover = null
    wake()
  }

  const onDouble = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    if (!hit(e.clientX - rect.left, e.clientY - rect.top)) resetView()
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const { px, py } = pos(e)
    const before = toWorld(px, py)
    const k = Math.min(4, Math.max(0.3, view.k * Math.exp(-e.deltaY * 0.0015)))
    view = { k, x: px - w / 2 - before.x * k, y: py - h / 2 - before.y * k }
    goal = { ...view }
    autoFit = false
    wake()
  }

  function resetView() {
    autoFit = true
    wake()
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return
    w = entry.contentRect.width
    h = entry.contentRect.height
    dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    wake()
  })
  resize.observe(canvas)

  const themeObserver = new MutationObserver(wake)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const scheme = window.matchMedia('(prefers-color-scheme: dark)')
  scheme.addEventListener('change', wake)

  canvas.style.cursor = 'grab'
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('dblclick', onDouble)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  return {
    sync(activeId, isLocal) {
      const modeChanged = isLocal !== local
      active = activeId
      local = isLocal
      const near = adj.get(activeId)
      const anchor = byId.get(activeId)
      for (const n of nodes) {
        const want = !isLocal || n.id === activeId || (near?.has(n.id) ?? false)
        if (want && !n.want && n.a < 0.01 && anchor) {
          n.x = anchor.x + (Math.random() - 0.5) * 30
          n.y = anchor.y + (Math.random() - 0.5) * 30
          n.vx = n.vy = 0
        }
        n.want = want
      }
      if (modeChanged) autoFit = true
      wake()
    },
    resetView,
    destroy() {
      dead = true
      cancelAnimationFrame(raf)
      resize.disconnect()
      themeObserver.disconnect()
      scheme.removeEventListener('change', wake)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('dblclick', onDouble)
      canvas.removeEventListener('wheel', onWheel)
    },
  }
}
