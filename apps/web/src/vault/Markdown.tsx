import { Fragment, type ReactNode } from 'react'
import { parseWikilink, type Note } from './notes'

interface Props {
  source: string
  notes: Map<string, Note>
  onOpen: (id: string) => void
  onTag: (tag: string) => void
}

type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'code'; text: string }

function parseBlocks(source: string): Block[] {
  const lines = source.split('\n')
  const blocks: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!line.trim()) continue
    if (line.startsWith('```')) {
      const body: string[] = []
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) body.push(lines[i]!)
      blocks.push({ type: 'code', text: body.join('\n') })
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', text: line.slice(3) })
    } else if (line.startsWith('> ')) {
      const quote: string[] = []
      for (; i < lines.length && lines[i]!.startsWith('> '); i++) quote.push(lines[i]!.slice(2))
      i--
      blocks.push({ type: 'quote', lines: quote })
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d/.test(line)
      const items: string[] = []
      for (; i < lines.length && /^(- |\d+\. )/.test(lines[i]!); i++) items.push(lines[i]!.replace(/^(- |\d+\. )/, ''))
      i--
      blocks.push({ type: 'list', ordered, items })
    } else {
      const para: string[] = [line]
      while (i + 1 < lines.length && lines[i + 1]!.trim() && !/^(```|## |> |- |\d+\. )/.test(lines[i + 1]!)) para.push(lines[++i]!)
      blocks.push({ type: 'paragraph', text: para.join(' ') })
    }
  }
  return blocks
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|(?<![\w/&])#[a-z][\w-]*)/

function Inline({ text, notes, onOpen, onTag }: Omit<Props, 'source'> & { text: string }): ReactNode {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('[[')) {
      const w = parseWikilink(part)
      if (!w) return part
      const target = notes.get(w.target)
      const label = w.alias ?? target?.title ?? w.target
      return target ? (
        // An anchor, not a button: a long link must wrap like text inside a list item.
        <a
          key={i}
          href="#"
          className="v-link"
          onClick={(e) => {
            e.preventDefault()
            onOpen(target.id)
          }}
        >
          {label}
        </a>
      ) : (
        <span key={i} className="v-link unresolved" title="No such note">
          {label}
        </span>
      )
    }
    if (part.startsWith('#') && part.length > 1 && /^#[a-z][\w-]*$/.test(part)) {
      return (
        <button key={i} type="button" className="v-tag" onClick={() => onTag(part.slice(1))}>
          {part}
        </button>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function Markdown({ source, notes, onOpen, onTag }: Props) {
  const inline = (text: string) => <Inline text={text} notes={notes} onOpen={onOpen} onTag={onTag} />
  return (
    <div className="v-md">
      {parseBlocks(source).map((b, i) => {
        switch (b.type) {
          case 'heading':
            return <h2 key={i}>{inline(b.text)}</h2>
          case 'paragraph':
            return <p key={i}>{inline(b.text)}</p>
          case 'code':
            return (
              <pre key={i}>
                <code>{b.text}</code>
              </pre>
            )
          case 'quote':
            return (
              <blockquote key={i}>
                {b.lines.map((l, j) =>
                  l.startsWith('— ') ? (
                    <footer key={j}>{inline(l)}</footer>
                  ) : (
                    <p key={j}>{inline(l)}</p>
                  ),
                )}
              </blockquote>
            )
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul'
            return (
              <Tag key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </Tag>
            )
          }
        }
      })}
    </div>
  )
}
