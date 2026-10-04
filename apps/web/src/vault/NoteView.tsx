import { useMemo, useState } from 'react'
import { formatTs } from '../lib/time'
import { frameUrl } from '../workmap/api'
import { Markdown } from './Markdown'
import { backlinks, type Note } from './notes'
import { Dot } from './Dot'

interface Props {
  note: Note
  notes: Note[]
  sessionId: string
  onOpen: (id: string) => void
  onTag: (tag: string) => void
}

function FrameCard({ src, ts, title }: { src: string; ts: number; title: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <figure className="v-frame">
      <img src={src} alt={`Screen at ${formatTs(ts)}: ${title}`} loading="lazy" onError={() => setFailed(true)} />
      <figcaption>
        <span>Screen moment</span>
        <time>{formatTs(ts)}</time>
      </figcaption>
    </figure>
  )
}

function mention(from: Note, id: string): string {
  const line = from.body.split('\n').find((l) => l.includes(`[[${id}`)) ?? ''
  return line.replace(/^(- |\d+\. )/, '').replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, t: string, a?: string) => a ?? t)
}

export function NoteView({ note, notes, sessionId, onOpen, onTag }: Props) {
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const mentions = useMemo(() => backlinks(notes, note.id), [notes, note.id])
  const props = Object.entries(note.props)

  return (
    <article className="v-note" key={note.id}>
      <nav className="v-crumbs" aria-label="Breadcrumb">
        {note.folder && <span>{note.folder}</span>}
        {note.folder && <span aria-hidden="true">/</span>}
        <span className="v-crumb-current">{note.title}</span>
      </nav>
      <h1>{note.title}</h1>

      <section className="v-props" aria-label="Properties">
        <h2>Properties</h2>
        <dl>
          {props.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div>
            <dt>tags</dt>
            <dd>
              {note.tags.map((t) => (
                <button key={t} type="button" className="v-tag" onClick={() => onTag(t)}>
                  #{t}
                </button>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      {note.frameTs !== undefined && (
        <FrameCard key={note.id} src={frameUrl(sessionId, note.frameTs)} ts={note.frameTs} title={note.title} />
      )}

      <Markdown source={note.body} notes={byId} onOpen={onOpen} onTag={onTag} />

      <section className="v-mentions" aria-label="Linked mentions">
        <h2>
          Linked mentions <span className="v-count">{mentions.length}</span>
        </h2>
        {mentions.length ? (
          <ul>
            {mentions.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onOpen(m.id)}>
                  <span className="v-mention-title">
                    <Dot kind={m.kind} />
                    {m.title}
                  </span>
                  <span className="v-mention-text">{mention(m, note.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="v-empty">No other note links here.</p>
        )}
      </section>
    </article>
  )
}
