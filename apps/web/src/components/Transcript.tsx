import { useEffect, useRef } from 'react'
import { formatTs } from '../lib/time'
import { spoken } from '../lib/spoken'
import type { TranscriptLine } from '../types/session'

const speakerLabel = { expert: 'Expert', agent: 'Apprentice' } as const

export function Transcript({ title, lines, empty }: { title: string; lines: TranscriptLine[]; empty: string }) {
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [lines.length])

  return (
    <aside className="side-panel" aria-label={title}>
      <h2>{title}</h2>
      {lines.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ol className="transcript" ref={listRef}>
          {lines.map((line) => (
            <li key={line.id} className={`line ${line.speaker}`}>
              <div className="line-meta">
                <span>{speakerLabel[line.speaker]}</span>
                <time>{formatTs(line.ts_ms)}</time>
              </div>
              <p>{line.speaker === 'agent' ? spoken(line.text) : line.text}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
