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
  born: number // intro start, ms
  s: number // hover scale, sprung
  sv: number
  la: number // label opacity
  slot: number // label position that fit last frame, tried first next frame
  lx: number
  ly: number
  phase: number
  px: number // screen position and radius this frame
  py: number
  sr: number
}

interface View {
  x: number
  y: number
  k: number
}

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  born: number
  color: string
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
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

const INTRO_MS = 650
const EDGE_DELAY = 220
const EDGE_MS = 520
const SHOCK_MS = 1000
const SPARK_MS = 700
const LABEL_H = 18
const LABEL_FONT = '500 11px system-ui, -apple-system, "Segoe UI", sans-serif'
const LABEL_FONT_STRONG = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif'

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1)
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export function createGraphEngine(
  canvas: HTMLCanvasElement,
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  onOpen: (id: string) => void,
): GraphEngine {
  const ctx = canvas.getContext('2d')!
  const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const adj = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set()]))
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }

  // The intro blooms outward from the best-connected note, ring by ring.
  const root = graph.nodes.reduce<GraphNode | null>((best, n) => (!best || adj.get(n.id)!.size > adj.get(best.id)!.size ? n : best), null)
  const depth = new Map<string, number>()
  if (root) {
    depth.set(root.id, 0)
    const queue = [root.id]
    while (queue.length) {
      const id = queue.shift()!
      for (const next of adj.get(id)!) {
        if (depth.has(next)) continue
        depth.set(next, depth.get(id)! + 1)
        queue.push(next)
      }
    }
  }
  const t0 = performance.now() + 80
  const ringCount = new Map<number, number>()

  const nodes: SimNode[] = graph.nodes.map((n, i) => {
    const angle = (i / graph.nodes.length) * Math.PI * 2
    const deg = adj.get(n.id)!.size
    const ring = depth.get(n.id) ?? 3
    const inRing = ringCount.get(ring) ?? 0
    ringCount.set(ring, inRing + 1)
    return {
      ...n,
      x: Math.cos(angle) * 140,
      y: Math.sin(angle) * 140,
      vx: 0,
      vy: 0,
      r: 5 + Math.sqrt(deg) * 2.2,
      a: 0,
      want: true,
      fixed: false,
      born: motion ? t0 + ring * 220 + inRing * 45 : 0,
      s: 1,
      sv: 0,
      la: 0,
      slot: 0,
      lx: 0,
      ly: 0,
      phase: Math.random() * Math.PI * 2,
      px: 0,
      py: 0,
      sr: 0,
    }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges = graph.edges.flatMap((e) => {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    return a && b ? [{ a, b, seed: Math.random() }] : []
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
  let shock: { node: SimNode; start: number } | null = null
  let sparks: Spark[] = []
  let w = 0
  let h = 0
  let dpr = 1
  let raf = 0
  let dead = false
  const textWidth = new Map<string, number>()

  const screenR = (n: SimNode) => n.r * Math.max(0.7, Math.min(view.k, 2))
  const toWorld = (px: number, py: number) => ({ x: (px - w / 2 - view.x) / view.k, y: (py - h / 2 - view.y) / view.k })
  const appear = (n: SimNode, now: number) => (motion ? Math.max(0, easeOutBack(clamp01((now - n.born) / INTRO_MS))) : 1)

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
      const scaleTo = n === hover ? 1.35 : 1
      n.sv = (n.sv + (scaleTo - n.s) * 0.22) * 0.68
      n.s += n.sv
      if (Math.abs(n.sv) > 0.001 || Math.abs(scaleTo - n.s) > 0.001) moving = true
      else n.s = scaleTo
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

  function drawGrid(color: string) {
    // A dot grid that pans slower than the graph, for depth.
    let gap = 34 * view.k
    while (gap < 18) gap *= 2
    const ox = (((w / 2 + view.x * 0.6) % gap) + gap) % gap
    const oy = (((h / 2 + view.y * 0.6) % gap) + gap) % gap
    ctx.globalAlpha = 0.35
    ctx.fillStyle = color
    for (let x = ox; x < w; x += gap) for (let y = oy; y < h; y += gap) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2)
    ctx.globalAlpha = 1
  }

  function labelText(n: SimNode) {
    return n.title.length > 28 ? `${n.title.slice(0, 27)}…` : n.title
  }

  function measure(text: string, strong: boolean) {
    const key = `${strong ? 1 : 0}${text}`
    let width = textWidth.get(key)
    if (width === undefined) {
      ctx.font = strong ? LABEL_FONT_STRONG : LABEL_FONT
      width = ctx.measureText(text).width
      textWidth.set(key, width)
    }
    return width
  }

  // Greedy placement: the most important labels claim space first; a label that fits nowhere
  // fades out instead of drawing over another one. Hovered and active labels always show.
  function placeLabels(visible: SimNode[], priority: (n: SimNode) => number) {
    const placed: Rect[] = []
    const discs: Rect[] = visible.map((n) => ({ x: n.px - n.sr - 2, y: n.py - n.sr - 2, w: n.sr * 2 + 4, h: n.sr * 2 + 4 }))
    const ranked = visible.map((n) => ({ n, p: priority(n) })).filter((e) => e.p > 0)
    ranked.sort((a, b) => b.p - a.p)
    const shown = new Set<SimNode>()
    for (const { n, p } of ranked) {
      const lw = measure(labelText(n), p >= 3) + 14
      const gap = n.sr + 5
      const candidates: Rect[] = [
        { x: n.px - lw / 2, y: n.py + gap, w: lw, h: LABEL_H },
        { x: n.px - lw / 2, y: n.py - gap - LABEL_H, w: lw, h: LABEL_H },
        { x: n.px + gap + 2, y: n.py - LABEL_H / 2, w: lw, h: LABEL_H },
        { x: n.px - gap - 2 - lw, y: n.py - LABEL_H / 2, w: lw, h: LABEL_H },
      ]
      // Clamped into the pane; a side slot clamped back over its own node then fails the disc test.
      for (const c of candidates) c.x = Math.min(Math.max(c.x, 4), w - c.w - 4)
      const fits = (c: Rect) =>
        c.y >= 2 && c.y + c.h <= h - 2 && !placed.some((r) => overlaps(r, c)) && !discs.some((d) => overlaps(d, c))
      const order = [n.slot, ...[0, 1, 2, 3].filter((s) => s !== n.slot)]
      let slot = order.find((s) => fits(candidates[s]!))
      if (slot === undefined && p >= 3) slot = 0
      if (slot === undefined) continue
      const r = candidates[slot]!
      n.slot = slot
      n.lx = r.x
      n.ly = r.y
      placed.push(r)
      shown.add(n)
    }
    return shown
  }

  function draw(now: number) {
    if (!w || !h) return
    const cs = getComputedStyle(canvas)
    const color = (name: string) => cs.getPropertyValue(name).trim()
    const accent = color('--accent')
    const edgeColor = color('--g-edge')
    const labelColor = color('--g-label')
    const halo = color('--g-halo')
    const kindColor = Object.fromEntries(Object.entries(kindColorVar).map(([k, v]) => [k, color(v)])) as Record<NoteKind, string>
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    for (const n of nodes) {
      const dx = motion ? Math.sin(now / 1700 + n.phase) * 2.2 : 0
      const dy = motion ? Math.cos(now / 2100 + n.phase * 1.3) * 2.2 : 0
      n.px = (n.x + dx) * view.k + view.x + w / 2
      n.py = (n.y + dy) * view.k + view.y + h / 2
      n.sr = screenR(n) * (0.4 + 0.6 * n.a) * appear(n, now) * n.s
    }

    const focus = hover?.id ?? null
    const near = focus ? adj.get(focus)! : null
    const activeNear = adj.get(active)
    const center = focus ?? active
    const dimmed = (n: SimNode) => focus !== null && n.id !== focus && !near!.has(n.id)

    drawGrid(edgeColor)

    // Edges draw themselves in once both ends have appeared.
    ctx.lineCap = 'round'
    for (const { a, b } of edges) {
      const fade = Math.min(a.a, b.a)
      if (fade <= 0) continue
      const grow = motion ? easeOutCubic(clamp01((now - Math.max(a.born, b.born) - EDGE_DELAY) / EDGE_MS)) : 1
      if (grow <= 0) continue
      const lit = a.id === center || b.id === center
      ctx.globalAlpha = fade * (focus !== null && !lit ? 0.1 : lit ? 0.95 : 0.7)
      ctx.strokeStyle = lit ? accent : edgeColor
      ctx.lineWidth = lit ? 1.6 : 1
      ctx.shadowBlur = lit ? 8 : 0
      ctx.shadowColor = accent
      const [from, to] = b.id === center ? [b, a] : [a, b]
      ctx.beginPath()
      ctx.moveTo(from.px, from.py)
      ctx.lineTo(from.px + (to.px - from.px) * grow, from.py + (to.py - from.py) * grow)
      ctx.stroke()
    }
    ctx.shadowBlur = 0

    // Signals flow outward along the links of the active (or hovered) note.
    if (motion) {
      for (const { a, b, seed } of edges) {
        if ((a.id !== center && b.id !== center) || Math.min(a.a, b.a) < 0.5) continue
        const grow = clamp01((now - Math.max(a.born, b.born) - EDGE_DELAY - EDGE_MS) / 400)
        if (grow <= 0) continue
        const [from, to] = a.id === center ? [a, b] : [b, a]
        for (let i = 0; i < 2; i++) {
          const f = (now / 1500 + seed + i / 2) % 1
          ctx.globalAlpha = Math.sin(Math.PI * f) * grow
          ctx.fillStyle = accent
          ctx.shadowBlur = 10
          ctx.shadowColor = accent
          ctx.beginPath()
          ctx.arc(from.px + (to.px - from.px) * f, from.py + (to.py - from.py) * f, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.shadowBlur = 0
    }

    const activeNode = byId.get(active)
    if (motion && activeNode && activeNode.a > 0.5) {
      for (let i = 0; i < 2; i++) {
        const age = (now / 2400 + i / 2) % 1
        ctx.globalAlpha = (1 - age) * 0.45 * activeNode.a
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(activeNode.px, activeNode.py, activeNode.sr + 5 + easeOutCubic(age) * 30, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    if (shock) {
      const age = (now - shock.start) / SHOCK_MS
      if (age >= 1) shock = null
      else {
        ctx.globalAlpha = (1 - age) * 0.6
        ctx.strokeStyle = accent
        ctx.lineWidth = 2.5 * (1 - age) + 0.5
        ctx.beginPath()
        ctx.arc(shock.node.px, shock.node.py, shock.node.sr + easeOutCubic(age) * 150, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    for (const n of nodes) {
      if (n.a <= 0 || n.sr <= 0.2) continue
      const base = n.a * (dimmed(n) ? 0.2 : 1)
      const fill = kindColor[n.kind]
      if (motion && n.kind === 'stop') {
        const breath = Math.sin(now / 650 + n.phase)
        ctx.globalAlpha = base * (0.16 + 0.1 * breath)
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.arc(n.px, n.py, n.sr + 5 + 2 * breath, 0, Math.PI * 2)
        ctx.fill()
      }
      if (n.id === active) {
        ctx.globalAlpha = base
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(n.px, n.py, n.sr + 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = accent
        ctx.beginPath()
        ctx.arc(n.px, n.py, n.sr + 3.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.globalAlpha = base
      ctx.shadowBlur = n.id === focus || n.id === active ? 18 : 7
      ctx.shadowColor = fill
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.arc(n.px, n.py, n.sr, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      // Soft highlight, so nodes read as small glass beads.
      const gloss = ctx.createRadialGradient(n.px - n.sr * 0.35, n.py - n.sr * 0.4, n.sr * 0.05, n.px, n.py, n.sr)
      gloss.addColorStop(0, 'rgba(255,255,255,0.55)')
      gloss.addColorStop(0.6, 'rgba(255,255,255,0.05)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gloss
      ctx.fill()
    }

    sparks = sparks.filter((s) => now - s.born < SPARK_MS)
    for (const s of sparks) {
      const age = (now - s.born) / SPARK_MS
      const travel = easeOutCubic(age)
      ctx.globalAlpha = 1 - age
      ctx.fillStyle = s.color
      ctx.beginPath()
      ctx.arc(s.x + s.vx * travel, s.y + s.vy * travel, 2.2 * (1 - age) + 0.4, 0, Math.PI * 2)
      ctx.fill()
    }

    const visible = nodes.filter((n) => n.a >= 0.5 && n.sr > 0.5 && !dimmed(n))
    const priority = (n: SimNode) => {
      if (n.id === focus) return 4
      if (n.id === active) return 3
      if (near?.has(n.id) || (focus === null && activeNear?.has(n.id))) return 2
      return 1 + adj.get(n.id)!.size / 100
    }
    const shown = placeLabels(visible, priority)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const n of nodes) {
      const target = shown.has(n) ? 1 : 0
      n.la += (target - n.la) * 0.18
      if (Math.abs(target - n.la) < 0.01) n.la = target
      if (n.la <= 0 || n.a <= 0) continue
      const p = priority(n)
      const text = labelText(n)
      const lw = measure(text, p >= 3) + 14
      const lit = n.id === focus || n.id === active
      ctx.globalAlpha = n.la * n.a * (dimmed(n) ? 0.2 : 1)
      ctx.fillStyle = halo
      ctx.strokeStyle = lit ? accent : edgeColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(n.lx, n.ly, lw, LABEL_H, LABEL_H / 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = p >= 3 ? LABEL_FONT_STRONG : LABEL_FONT
      ctx.fillStyle = lit ? accent : labelColor
      ctx.fillText(text, n.lx + 7, n.ly + LABEL_H / 2 + 0.5)
    }
    ctx.globalAlpha = 1
  }

  // Labels fade, so a frame where only they change still counts as moving.
  const labelsMoving = () => nodes.some((n) => n.la > 0 && n.la < 1)

  function frame() {
    raf = 0
    if (dead) return
    const moving = step()
    draw(performance.now())
    if (moving || drag || motion || labelsMoving()) raf = requestAnimationFrame(frame)
  }

  const wake = () => {
    if (!raf && !dead) raf = requestAnimationFrame(frame)
  }

  function burst(n: SimNode) {
    if (!motion) return
    const fill = getComputedStyle(canvas).getPropertyValue(kindColorVar[n.kind]).trim()
    const now = performance.now()
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.3
      const dist = 26 + Math.random() * 30
      sparks.push({ x: n.px, y: n.py, vx: Math.cos(angle) * dist, vy: Math.sin(angle) * dist, born: now, color: fill })
    }
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
      if (!drag.moved) {
        burst(drag.node)
        onOpen(drag.node.id)
      }
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
      const anchor = byId.get(activeId)
      if (motion && active && activeId !== active && anchor) {
        shock = { node: anchor, start: performance.now() }
        // Nudge the neighbours so the graph visibly reacts to the new focus.
        for (const id of adj.get(activeId) ?? []) {
          const n = byId.get(id)!
          n.vx += (n.x - anchor.x) * 0.06
          n.vy += (n.y - anchor.y) * 0.06
        }
      }
      active = activeId
      local = isLocal
      const near = adj.get(activeId)
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
