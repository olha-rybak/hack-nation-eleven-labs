import { useEffect, useRef } from 'react'
import { useSessionFeed } from '../session/useSessionFeed'
import { formatTs } from '../lib/time'

interface Props {
  sessionId: string | null
  title: string
}

const speakerLabel = { expert: 'Expert', agent: 'Apprentice' } as const

export function SidePanel({ sessionId, title }: Props) {
  const lines = useSessionFeed(sessionId).transcript
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [lines.length])

  return (
    <aside className="side-panel" aria-label={title}>
      <h2>{title}</h2>
      {lines.length === 0 ? (
        <p className="empty">The conversation appears here as it is transcribed.</p>
      ) : (
        <ol className="transcript" ref={listRef}>
          {lines.map((line) => (
            <li key={line.id} className={`line ${line.speaker}`}>
              <div className="line-meta">
                <span>{speakerLabel[line.speaker]}</span>
                <time>{formatTs(line.ts_ms)}</time>
              </div>
              <p>{line.text}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
