import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { DEMO_SESSION } from '../lib/lastSession'
import { GraphView } from './GraphView'
import { frameUrl } from '../workmap/api'
import { fileName, frameName, INDEX_ID, notePath, toMarkdown, type Note } from './notes'
import { NoteView } from './NoteView'
import { QuickSwitcher } from './QuickSwitcher'
import { Dot } from './Dot'
import { shortcutHint } from './shortcut'
import { Sidebar } from './Sidebar'
import { Splitter } from './Splitter'
import { useColumns } from './useColumns'
import { makeZip, type ZipFile } from './zip'

type Tab = 'files' | 'note' | 'graph'

const tabs: [Tab, string][] = [
  ['files', 'Files'],
  ['note', 'Note'],
  ['graph', 'Graph'],
]

// Frames that cannot be fetched (no server, demo data) are left out; their embeds stay unresolved.
async function fetchFrames(sessionId: string, notes: Note[]): Promise<ZipFile[]> {
  const stamps = [...new Set(notes.flatMap((n) => (n.frameTs === undefined ? [] : [n.frameTs])))]
  const frames = await Promise.all(
    stamps.map(async (ts) => {
      const res = await fetch(frameUrl(sessionId, ts)).catch(() => null)
      if (!res?.ok || !res.headers.get('content-type')?.startsWith('image/')) return null
      return { name: frameName(ts), data: new Uint8Array(await res.arrayBuffer()) }
    }),
  )
  return frames.filter((f) => f !== null)
}

async function download(sessionId: string, notes: Note[], name: string) {
  const root = fileName(name).slice(0, 60)
  const files = [
    ...notes.map((n) => ({ name: notePath(n), data: toMarkdown(n) })),
    ...(await fetchFrames(sessionId, notes)),
  ]
  const zip = makeZip(files.map((f) => ({ ...f, name: `${root}/${f.name}` })))
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${root}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

interface Props {
  sessionId: string
  notes: Note[]
  demo: boolean
}

export function Vault({ sessionId, notes, demo }: Props) {
  const [history, setHistory] = useState({ stack: [INDEX_ID], pos: 0 })
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('note')
  const [switcher, setSwitcher] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const { ref: panesRef, cols, set: resize, style: colStyle } = useColumns()

  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const activeId = history.stack[history.pos]!
  const note = byId.get(activeId) ?? notes[0]!

  const open = useCallback((id: string) => {
    setTab('note')
    setHistory((h) => (h.stack[h.pos] === id ? h : { stack: [...h.stack.slice(0, h.pos + 1), id], pos: h.pos + 1 }))
  }, [])
  const go = (delta: number) => setHistory((h) => ({ ...h, pos: Math.min(Math.max(h.pos + delta, 0), h.stack.length - 1) }))
  const showTag = useCallback((tag: string) => {
    setQuery(`#${tag}`)
    setTab('files')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSwitcher((s) => !s)
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault()
        setSwitcher(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const name = byId.get(INDEX_ID)?.title ?? 'Vault'

  return (
    <div className="vault" data-tab={tab}>
      <div className="v-tabs" role="tablist" aria-label="Vault panes">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="v-panes" ref={panesRef} style={colStyle}>
        <aside className="v-pane v-pane-files">
          <Sidebar
            name={name}
            notes={notes}
            activeId={note.id}
            query={query}
            searchRef={searchRef}
            onQuery={setQuery}
            onOpen={open}
          />
        </aside>

        <main className="v-pane v-pane-note">
          <header className="v-tabbar">
            <div className="v-nav">
              <button type="button" aria-label="Back" disabled={history.pos === 0} onClick={() => go(-1)}>
                ←
              </button>
              <button type="button" aria-label="Forward" disabled={history.pos === history.stack.length - 1} onClick={() => go(1)}>
                →
              </button>
            </div>
            <div className="v-tab">
              <Dot kind={note.kind} />
              <span>{note.title}</span>
            </div>
            <div className="v-actions">
              {demo && (
                <span className="v-badge" title="No Work Map for this session yet, showing the returns desk example">
                  demo data
                </span>
              )}
              {demo && sessionId !== DEMO_SESSION && (
                <Link className="v-btn ghost" to={`/debrief/${encodeURIComponent(sessionId)}`}>
                  Finish the debrief
                </Link>
              )}
              <button type="button" className="v-btn ghost" onClick={() => setSwitcher(true)}>
                Jump to <kbd>{shortcutHint}</kbd>
              </button>
              <button type="button" className="v-btn" onClick={() => void download(sessionId, notes, name)}>
                Export to Obsidian
              </button>
            </div>
          </header>
          <div className="v-scroll">
            <NoteView note={note} notes={notes} sessionId={sessionId} onOpen={open} onTag={showTag} />
          </div>
        </main>

        <Splitter side="left" width={cols.left} onResize={resize} />
        <Splitter side="right" width={cols.right} onResize={resize} />

        <aside className="v-pane v-pane-graph">
          <GraphView notes={notes} activeId={note.id} onOpen={open} />
        </aside>
      </div>

      {switcher && <QuickSwitcher notes={notes} onOpen={open} onClose={() => setSwitcher(false)} />}
    </div>
  )
}
