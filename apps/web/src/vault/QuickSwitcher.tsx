import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzy, type Note } from './notes'
import { Dot } from './Dot'

interface Props {
  notes: Note[]
  onOpen: (id: string) => void
  onClose: () => void
}

export function QuickSwitcher({ notes, onOpen, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const matches = useMemo(() => {
    if (!query.trim()) return notes
    return notes
      .map((n) => ({ n, score: fuzzy(query, n.title) }))
      .filter((m) => m.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((m) => m.n)
  }, [notes, query])

  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const choose = (n: Note | undefined) => {
    if (!n) return
    onOpen(n.id)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') choose(matches[cursor])
  }

  return (
    <div className="v-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="v-switcher" role="dialog" aria-modal="true" aria-label="Quick switcher" onKeyDown={onKeyDown}>
        <input
          autoFocus
          value={query}
          placeholder="Jump to a note"
          aria-label="Jump to a note"
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
        />
        <ul ref={listRef} role="listbox">
          {matches.map((n, i) => (
            <li key={n.id} role="option" aria-selected={i === cursor}>
              <button type="button" onMouseMove={() => setCursor(i)} onClick={() => choose(n)}>
                <Dot kind={n.kind} />
                <span>{n.title}</span>
                {n.folder && <em>{n.folder}</em>}
              </button>
            </li>
          ))}
          {!matches.length && <li className="v-empty">No notes match.</li>}
        </ul>
        <footer>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </footer>
      </div>
    </div>
  )
}
