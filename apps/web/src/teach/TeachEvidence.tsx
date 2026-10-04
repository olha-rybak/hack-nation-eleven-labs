import { useEffect, useRef, useState } from 'react'
import type { Quote } from '../types/workmap'
import { frameUrl } from '../workmap/api'
import { formatTs } from '../lib/time'
import { TeachFrameViewer } from './TeachFrameViewer'

export function TeachEvidence({ sessionId, timestamp, quote, decision, showFrame = true }: {
  sessionId: string; timestamp: number; quote: Quote; decision: string; showFrame?: boolean
}) {
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [expanded, setExpanded] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const wasExpanded = useRef(false)
  useEffect(() => {
    if (wasExpanded.current && !expanded) opener.current?.focus()
    wasExpanded.current = expanded
  }, [expanded])
  const [attempt, setAttempt] = useState(0)
  return <section className="teach-evidence" aria-label="Expert evidence">
    <p className="teach-eyebrow">Expert’s recorded decision</p>
    <p className="teach-recorded-decision">{decision}</p>
    <blockquote>“{quote.text}”</blockquote>
    <p className="teach-attribution">{quote.speaker}<span>{quote.source.replaceAll('_', ' ')} · {formatTs(quote.ts_ms)}</span></p>
    {showFrame && <figure className="teach-real-frame">
      {imageState === 'loading' && <p role="status">Loading screen moment…</p>}
      {imageState === 'error' && <div role="alert"><p>This screen moment is unavailable. The quote is still shown above.</p><button className="teach-button teach-glass" type="button" onClick={() => { setImageState('loading'); setAttempt(attempt + 1) }}>Retry frame</button></div>}
      <img key={attempt} src={frameUrl(sessionId, timestamp)} alt={`Expert’s screen at ${formatTs(timestamp)}`} hidden={imageState !== 'ready'} onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />
      <figcaption>Recorded expert screen · {formatTs(timestamp)}</figcaption>
      {imageState === 'ready' && <button ref={opener} className="teach-text-link" type="button" aria-haspopup="dialog" onClick={() => setExpanded(true)}>Enlarge screen moment</button>}
    </figure>}
    {expanded && <TeachFrameViewer src={frameUrl(sessionId, timestamp)} ts={timestamp} caption={decision} onClose={() => setExpanded(false)} />}
  </section>
}
