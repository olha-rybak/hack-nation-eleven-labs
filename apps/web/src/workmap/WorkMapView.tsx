import { useEffect, useState } from 'react'
import { formatTs } from '../lib/time'
import type { Guardrail, GuardrailKind, Quote, Step, WorkMap } from '../types/workmap'
import { frameUrl } from './api'
import { FrameViewer, type FrameMoment } from './FrameViewer'
import './workmap.css'

const kindLabel: Record<GuardrailKind, string> = {
  limit: 'Limit',
  exception: 'Exception',
  stop_and_ask: 'Stop and ask',
  never_do: 'Never do',
}

const sourceLabel: Record<Quote['source'], string> = {
  live_question: 'live question',
  debrief: 'debrief',
  narration: 'while working',
}

function expertName(map: WorkMap): string {
  const counts = new Map<string, number>()
  for (const s of map.steps) counts.set(s.reason.speaker, (counts.get(s.reason.speaker) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'the expert'
}

function governs(guardrail: Guardrail, step: Step): boolean {
  return step.guardrail_ids.includes(guardrail.id) || step.index === guardrail.step_index
}

// A debrief quote was spoken after the task, so its own timestamp shows the end screen.
// Jump to the moment it is about instead.
function quoteMoment(quote: Quote, aboutTs: number): number {
  return quote.source === 'debrief' ? aboutTs : quote.ts_ms
}

const formatConfirmed = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function WorkMapView({ sessionId, map }: { sessionId: string; map: WorkMap }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [moment, setMoment] = useState<FrameMoment | null>(null)
  const expert = expertName(map)
  const judgmentCalls = map.steps.filter((s) => s.is_judgment_call).length
  const selectedGuardrail = map.guardrails.find((g) => g.id === selected) ?? null

  useEffect(() => {
    if (!selectedGuardrail) return
    const first = map.steps.find((s) => governs(selectedGuardrail, s))
    document.getElementById(`step-${first?.index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [selectedGuardrail, map.steps])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggle = (id: string) => setSelected((cur) => (cur === id ? null : id))
  const show = (ts: number, caption: string) => setMoment({ src: frameUrl(sessionId, ts), ts, caption })

  return (
    <div className="wm">
      <header className="wm-head">
        <p className="wm-eyebrow">
          Work Map · {expert} · session {map.session_id}
        </p>
        <h1>{map.title}</h1>
        {map.confirmed_at ? (
          <p className="wm-confirmed">Confirmed by {expert}, {formatConfirmed(map.confirmed_at)}</p>
        ) : (
          <p className="wm-draft">Draft. {expert} has not confirmed the teach-back yet.</p>
        )}
        <dl className="wm-counts">
          <div>
            <dt>Steps</dt>
            <dd>{map.steps.length}</dd>
          </div>
          <div className="judgment">
            <dt>Judgment calls</dt>
            <dd>{judgmentCalls}</dd>
          </div>
          <div className="guardrail">
            <dt>Guardrails</dt>
            <dd>{map.guardrails.length}</dd>
          </div>
        </dl>
      </header>

      {map.guardrails.length > 0 && (
        <section className="wm-guardrails" aria-labelledby="wm-guardrails-title">
          <div className="wm-section-head">
            <h2 id="wm-guardrails-title">Guardrails</h2>
            <span>{selected ? 'Highlighted steps follow this rule. Select it again to clear.' : 'Select one to see the steps it governs.'}</span>
          </div>
          <div className="wm-guardrail-list">
            {map.guardrails.map((g) => (
              <article key={g.id} className={`wm-guardrail ${g.kind}`} aria-current={selected === g.id}>
                <button type="button" className="wm-guardrail-main" aria-pressed={selected === g.id} onClick={() => toggle(g.id)}>
                  <span className={`wm-kind ${g.kind}`}>{kindLabel[g.kind]}</span>
                  <span className="wm-guardrail-statement">{g.statement}</span>
                </button>
                <p className="wm-guardrail-quote">
                  “{g.reason.text}”
                  <span>
                    {g.reason.speaker}, {sourceLabel[g.reason.source]}
                  </span>
                </p>
                <button type="button" className="wm-moment" onClick={() => show(g.frame_ts, g.statement)}>
                  Screen moment {formatTs(g.frame_ts)}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="wm-steps-title">
        <div className="wm-section-head">
          <h2 id="wm-steps-title">Steps</h2>
        </div>
        <ol className={`wm-steps ${selected ? 'filtering' : ''}`}>
          {map.steps.map((step) => {
            const rails = map.guardrails.filter((g) => step.guardrail_ids.includes(g.id))
            const lit = selectedGuardrail ? governs(selectedGuardrail, step) : false
            return (
              <li
                key={step.index}
                id={`step-${step.index}`}
                className={`wm-step ${step.is_judgment_call ? 'judgment' : ''} ${lit ? 'lit' : ''}`}
              >
                <div className="wm-rail" aria-hidden="true">
                  <span className="wm-num">{step.index}</span>
                </div>
                <div className="wm-card">
                  <div className="wm-step-top">
                    <time>{formatTs(step.frame_ts)}</time>
                    {step.is_judgment_call && <span className="wm-tag judgment">Judgment call</span>}
                  </div>
                  <h3>{step.title}</h3>
                  <div className="wm-step-body">
                    <button
                      type="button"
                      className="wm-thumb"
                      onClick={() => show(step.frame_ts, `Step ${step.index} · ${step.title}`)}
                      aria-label={`Enlarge screen moment at ${formatTs(step.frame_ts)}`}
                    >
                      <img src={frameUrl(sessionId, step.frame_ts)} alt="" loading="lazy" />
                    </button>
                    <div className="wm-step-text">
                      <p className="wm-decision">
                        <span>Decision</span>
                        {step.decision}
                      </p>
                      <blockquote className="wm-quote">
                        <p>“{step.reason.text}”</p>
                        <footer>
                          {step.reason.speaker},{' '}
                          <button
                            type="button"
                            onClick={() =>
                              show(quoteMoment(step.reason, step.frame_ts), `“${step.reason.text}” ${step.reason.speaker}`)
                            }
                          >
                            {sourceLabel[step.reason.source]} at {formatTs(step.reason.ts_ms)}
                          </button>
                        </footer>
                      </blockquote>
                      {rails.length > 0 && (
                        <ul className="wm-step-guardrails" aria-label="Guardrails on this step">
                          {rails.map((g) => (
                            <li key={g.id}>
                              <button type="button" aria-pressed={selected === g.id} onClick={() => toggle(g.id)}>
                                <span className={`wm-kind ${g.kind}`}>{kindLabel[g.kind]}</span>
                                {g.statement}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {map.open_questions.length > 0 && (
        <section className="wm-open" aria-labelledby="wm-open-title">
          <h2 id="wm-open-title">Still unclear</h2>
          <ul>
            {map.open_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      {moment && <FrameViewer moment={moment} onClose={() => setMoment(null)} />}
    </div>
  )
}
