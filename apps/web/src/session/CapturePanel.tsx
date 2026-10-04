import { useEffect, useRef, useState } from 'react'
import { spoken } from '../lib/spoken'
import { formatTs } from '../lib/time'
import type { AskCue, EventCorrection, OffRecordRemoved, ScreenEvent, TranscriptLine } from '../types/session'
import { describeEvent, LOW_CONFIDENCE } from './describe'
import './panel.css'

const WINDOW_SEC = Number(import.meta.env.VITE_OFF_THE_RECORD_WINDOW_SEC) || 30
const BUDGET = Number(import.meta.env.VITE_MAX_LIVE_QUESTIONS) || 5

type Item =
  | { key: string; ts: number; type: 'event'; event: ScreenEvent }
  | { key: string; ts: number; type: 'line'; line: TranscriptLine }
  | { key: string; ts: number; type: 'ask'; ask: AskCue }

interface Props {
  live: boolean
  paused: boolean
  events: ScreenEvent[]
  transcript: TranscriptLine[]
  asks: AskCue[]
  leaving: Set<string>
  lastRemoved: OffRecordRemoved | null
  correctEvent: (id: string, patch: EventCorrection) => Promise<ScreenEvent>
  onPauseToggle: () => void
  onOffTheRecord: () => Promise<OffRecordRemoved>
  onEndTask: () => void
}

function removedNotice(r: OffRecordRemoved): string {
  const n = r.deleted_event_ids.length
  const reverted = r.reverted_events.length
  return (
    `Removed the last ${WINDOW_SEC} s: ${n} ${n === 1 ? 'event' : 'events'}, ` +
    `${r.transcript} ${r.transcript === 1 ? 'line' : 'lines'}, ${r.frames} ${r.frames === 1 ? 'frame' : 'frames'}` +
    (reverted ? `; ${reverted} ${reverted === 1 ? 'event' : 'events'} back to the earlier value` : '') +
    '. Deleted from disk.'
  )
}

export function CapturePanel(props: Props) {
  const { events, transcript, asks, leaving, live, paused } = props
  const [editing, setEditing] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [busy, setBusy] = useState<'off' | 'end' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const pinned = useRef(true)
  const shownRemoved = useRef<OffRecordRemoved | null>(null)

  const askedIds = new Set(asks.map((a) => a.event_id))
  const asked = asks.length ? Math.max(...asks.map((a) => a.question_index)) : 0
  const budget = asks.at(-1)?.budget ?? BUDGET

  const items: Item[] = [
    ...events.map((event): Item => ({ key: event.id, ts: event.ts_ms, type: 'event', event })),
    ...transcript.map((line): Item => ({ key: line.id, ts: line.ts_ms, type: 'line', line })),
    // A cue sorts just after the event it is about.
    ...asks.map((ask): Item => ({ key: `ask-${ask.event_id}`, ts: ask.ts_ms + 0.5, type: 'ask', ask })),
  ].sort((a, b) => a.ts - b.ts)

  const count = items.length
  useEffect(() => {
    const el = listRef.current
    if (el && pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [count])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(id)
  }, [notice])

  // Button and voice both update lastRemoved; show the notice once per removal.
  useEffect(() => {
    const r = props.lastRemoved
    if (!r || r === shownRemoved.current) return
    shownRemoved.current = r
    setNotice(removedNotice(r))
  }, [props.lastRemoved])

  function highlight(eventId: string) {
    setFlash(eventId)
    // The panel may live in its own window, so look in the list's document.
    listRef.current?.ownerDocument.getElementById(`ev-${eventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => setFlash((f) => (f === eventId ? null : f)), 1600)
  }

  async function offTheRecord() {
    setBusy('off')
    try {
      await props.onOffTheRecord()
      // Notice comes from the lastRemoved effect (also covers the voice path).
    } catch (e) {
      setNotice(`${e instanceof Error ? e.message : 'Off the record failed'}. Nothing was removed.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <aside className="side-panel cp" aria-label="Apprentice">
      <header className="cp-head">
        <h2>Apprentice</h2>
        {asks.length > 0 ? (
          <div className="cp-budget" aria-label={`${asked} of ${budget} live questions asked`}>
            <span>
              {asked} of {budget} asked
            </span>
            <span className="cp-dots" aria-hidden="true">
              {Array.from({ length: budget }, (_, i) => (
                <i key={i} className={i < asked ? 'on' : ''} />
              ))}
            </span>
          </div>
        ) : (
          live && (
            <div className={`cp-budget cp-watching${paused ? ' paused' : ''}`} role="status">
              <span className="cp-live" aria-hidden="true" />
              {paused ? 'Paused' : 'Watching'}
            </div>
          )
        )}
      </header>

      <p className="cp-explain">What the apprentice saw and heard. Select an event to correct it.</p>

      <ol
        className="cp-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
      >
        {items.length === 0 && <li className="cp-empty">{live ? 'Watching. Events appear here as the screen changes.' : 'Start sharing to see what the apprentice records.'}</li>}
        {items.map((item) => {
          const out = leaving.has(item.key) ? ' leaving' : ''
          if (item.type === 'line') {
            return (
              <li key={item.key} className={`line ${item.line.speaker}${out}`}>
                <div className="line-meta">
                  <span>{item.line.speaker === 'agent' ? 'Apprentice' : 'Expert'}</span>
                  <time>{formatTs(item.line.ts_ms)}</time>
                </div>
                <p>{item.line.speaker === 'agent' ? spoken(item.line.text) : item.line.text}</p>
              </li>
            )
          }
          if (item.type === 'ask') {
            const about = events.find((e) => e.id === item.ask.event_id)
            return (
              <li key={item.key} className={`cp-ask${out}`}>
                <span>
                  Question {item.ask.question_index} of {item.ask.budget}
                  {item.ask.guardrail && ' · guardrail'}
                </span>
                {about && (
                  <button type="button" className="link" onClick={() => highlight(about.id)}>
                    about {describeEvent(about)}
                  </button>
                )}
              </li>
            )
          }
          const e = item.event
          return (
            <li key={item.key} id={`ev-${e.id}`} className={`cp-event${out}${flash === e.id ? ' flash' : ''}`}>
              {editing === e.id ? (
                <EventEditor
                  event={e}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => {
                    await props.correctEvent(e.id, patch)
                    setEditing(null)
                  }}
                />
              ) : (
                <button type="button" className="cp-event-main" onClick={() => setEditing(e.id)} aria-label={`Correct: ${describeEvent(e)}`}>
                  <time>{formatTs(e.ts_ms)}</time>
                  <span className="cp-event-text">{describeEvent(e)}</span>
                  <span className="cp-tags">
                    {askedIds.has(e.id) && <span>Asked</span>}
                    {e.corrected && <span>Corrected</span>}
                    {!e.corrected && e.confidence < LOW_CONFIDENCE && <span>Unsure</span>}
                  </span>
                </button>
              )}
            </li>
          )
        })}
      </ol>

      <footer className="cp-foot">
        {paused && (
          <p className="cp-notice" role="status">
            Paused: nothing is being recorded, mic muted.
          </p>
        )}
        {notice && (
          <p className="cp-notice" role="status">
            {notice}
          </p>
        )}
        <div className="cp-actions">
          <button type="button" className="button ghost" onClick={props.onPauseToggle} disabled={!live || busy !== null}>
            {paused ? 'Resume recording' : 'Pause recording'}
          </button>
          <button type="button" className="button ghost" onClick={offTheRecord} disabled={!live || paused || busy !== null}>
            {busy === 'off' ? 'Removing…' : 'Off the record'}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setBusy('end')
              props.onEndTask()
            }}
            disabled={!live || busy !== null}
          >
            {busy === 'end' ? 'Ending…' : 'End task'}
          </button>
        </div>
        <p className="cp-fine">Say “off the record” to delete the last {WINDOW_SEC} seconds. End task starts the debrief.</p>
      </footer>
    </aside>
  )
}

function EventEditor({
  event,
  onSave,
  onCancel,
}: {
  event: ScreenEvent
  onSave: (patch: EventCorrection) => Promise<void>
  onCancel: () => void
}) {
  const [entity, setEntity] = useState(event.entity)
  const [field, setField] = useState(event.field ?? '')
  const [before, setBefore] = useState(event.before ?? '')
  const [after, setAfter] = useState(event.after ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const id = `edit-${event.id}`

  return (
    <form
      className="cp-edit"
      onSubmit={async (ev) => {
        ev.preventDefault()
        setSaving(true)
        setError(null)
        const patch: EventCorrection = {}
        if (entity !== event.entity) patch.entity = entity
        if (field !== (event.field ?? '')) patch.field = field || null
        if (before !== (event.before ?? '')) patch.before = before || null
        if (after !== (event.after ?? '')) patch.after = after || null
        try {
          if (Object.keys(patch).length) await onSave(patch)
          else onCancel()
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e))
          setSaving(false)
        }
      }}
    >
      <p className="cp-edit-title">Correct what the apprentice saw</p>
      <label htmlFor={`${id}-entity`}>On</label>
      <input id={`${id}-entity`} value={entity} onChange={(e) => setEntity(e.target.value)} />
      <label htmlFor={`${id}-field`}>Field</label>
      <input id={`${id}-field`} value={field} onChange={(e) => setField(e.target.value)} />
      <label htmlFor={`${id}-before`}>From</label>
      <input id={`${id}-before`} value={before} onChange={(e) => setBefore(e.target.value)} />
      <label htmlFor={`${id}-after`}>To</label>
      <input id={`${id}-after`} value={after} onChange={(e) => setAfter(e.target.value)} autoFocus />
      {error && <p className="cp-edit-error">{error}</p>}
      <div className="cp-edit-actions">
        <button type="button" className="link" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button compact" disabled={saving}>
          {saving ? 'Saving…' : 'Save correction'}
        </button>
      </div>
    </form>
  )
}
