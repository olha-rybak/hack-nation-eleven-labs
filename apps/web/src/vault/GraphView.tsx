import { useEffect, useMemo, useRef, useState } from 'react'
import { createGraphEngine, type GraphEngine } from './graphEngine'
import { buildGraph, type Note } from './notes'

const legend = [
  ['--g-index', 'Index'],
  ['--g-step', 'Step'],
  ['--g-judgment', 'Judgment call'],
  ['--g-stop', 'Stop rule'],
  ['--g-guardrail', 'Guardrail'],
  ['--g-question', 'Question'],
] as const

interface Props {
  notes: Note[]
  activeId: string
  onOpen: (id: string) => void
}

export function GraphView({ notes, activeId, onOpen }: Props) {
  const [local, setLocal] = useState(false)
  const graph = useMemo(() => buildGraph(notes), [notes])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GraphEngine | null>(null)
  const openRef = useRef(onOpen)
  const latest = useRef({ activeId, local })

  useEffect(() => {
    openRef.current = onOpen
    latest.current = { activeId, local }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = createGraphEngine(canvas, graph, (id) => openRef.current(id))
    engine.sync(latest.current.activeId, latest.current.local)
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [graph])

  useEffect(() => {
    engineRef.current?.sync(activeId, local)
  }, [activeId, local])

  return (
    <div className="v-graph">
      <header className="v-pane-head">
        <span>Graph view</span>
        <div className="v-seg" role="group" aria-label="Graph scope">
          <button type="button" aria-pressed={!local} onClick={() => setLocal(false)}>
            Global
          </button>
          <button type="button" aria-pressed={local} onClick={() => setLocal(true)}>
            Local
          </button>
        </div>
      </header>
      <div className="v-graph-stage">
        <canvas ref={canvasRef} role="img" aria-label="Graph of linked notes" />
        <ul className="v-legend">
          {legend.map(([v, label]) => (
            <li key={v}>
              <i style={{ background: `var(${v})` }} />
              {label}
            </li>
          ))}
        </ul>
        <p className="v-graph-hint">Drag to move. Scroll to zoom. Double-click to reset.</p>
      </div>
    </div>
  )
}
