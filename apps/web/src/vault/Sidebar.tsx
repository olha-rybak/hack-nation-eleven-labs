import { useState, type RefObject } from 'react'
import { Dot } from './Dot'
import { INDEX_ID, type Note, type NoteFolder } from './notes'
import { shortcutHint } from './shortcut'
const folders: Exclude<NoteFolder, ''>[] = ['Steps', 'Guardrails', 'Questions']

interface Props {
  name: string
  notes: Note[]
  activeId: string
  query: string
  searchRef: RefObject<HTMLInputElement | null>
  onQuery: (q: string) => void
  onOpen: (id: string) => void
}

function snippet(note: Note, q: string): string {
  const line = note.body.split('\n').find((l) => l.toLowerCase().includes(q)) ?? ''
  return line.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, t: string, a?: string) => a ?? t).replace(/[#>*`]/g, '').trim()
}

export function Sidebar({ name, notes, activeId, query, searchRef, onQuery, onOpen }: Props) {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const q = query.trim().toLowerCase().replace(/^#/, '')
  const index = notes.find((n) => n.id === INDEX_ID)
  const results = q
    ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))
    : []

  const toggle = (f: string) =>
    setClosed((cur) => {
      const next = new Set(cur)
      if (!next.delete(f)) next.add(f)
      return next
    })

  const item = (n: Note, extra?: string) => (
    <li key={n.id}>
      <button type="button" className="v-file" aria-current={n.id === activeId ? 'page' : undefined} onClick={() => onOpen(n.id)}>
        <Dot kind={n.kind} />
        <span className="v-file-text">
          <span className="v-file-title">{n.title}</span>
          {extra && <span className="v-file-sub">{extra}</span>}
        </span>
      </button>
    </li>
  )

  return (
    <div className="v-side">
      <header className="v-vault-name">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 2 4 8l2 11 6 3 6-3 2-11-8-6Zm0 3.2 4.6 3.5L12 12 7.4 8.7 12 5.200Z" fill="currentColor" opacity="0.9" />
        </svg>
        <span title={name}>{name}</span>
      </header>
      <div className="v-search">
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search notes"
          aria-label="Search notes"
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onQuery('')}
        />
        <kbd>{shortcutHint}</kbd>
      </div>
      <nav className="v-tree" aria-label="Files">
        {q ? (
          results.length ? (
            <ul>{results.map((n) => item(n, snippet(n, q)))}</ul>
          ) : (
            <p className="v-empty">No notes match.</p>
          )
        ) : (
          <>
            {index && <ul>{item(index)}</ul>}
            {folders.map((f) => {
              const inFolder = notes.filter((n) => n.folder === f)
              if (!inFolder.length) return null
              const open = !closed.has(f)
              return (
                <section key={f}>
                  <button type="button" className="v-folder" aria-expanded={open} onClick={() => toggle(f)}>
                    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
                      <path d="M3 1.500 7 5 3 8.500" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{f}</span>
                    <span className="v-count">{inFolder.length}</span>
                  </button>
                  {open && <ul className="v-children">{inFolder.map((n) => item(n))}</ul>}
                </section>
              )
            })}
          </>
        )}
      </nav>
    </div>
  )
}
