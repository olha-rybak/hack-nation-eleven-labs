import { useEffect, useState } from 'react'
import { Link } from 'react-router'
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
  earlier_session: 'earlier session',
}

function expertName(map: WorkMap): string {
  const counts = new Map<string, number>()
  for (const s of map.steps) counts.set(s.reason.speaker, (counts.get(s.reason.speaker) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'the expert'
}

function governs(guardrail: Guardrail, step: Step): boolean {
  return step.guardrail_ids.includes(guardrail.id) || step.index === guardrail.step_index
}

// A debrief or earlier-session quote was not spoken at this moment of the task, so its own timestamp
// shows the wrong screen. Jump to the moment it is about instead.
function quoteMoment(quote: Quote, aboutTs: number): number {
  return quote.source === 'debrief' || quote.source === 'earlier_session' ? aboutTs : quote.ts_ms
}

const formatConfirmed = (iso: string) => {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} at ${time}`
}

export function WorkMapView({ sessionId, map }: { sessionId: string; map: WorkMap }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [moment, setMoment] = useState<FrameMoment | null>(null)
  const expert = expertName(map)
  const judgmentCalls = map.steps.filter((s) => s.is_judgment_call).length
  const selectedGuardrail = map.guardrails.find((g) => g.id === selected) ?? null
  const heroStep = map.steps.find((s) => s.is_judgment_call) ?? map.steps[0]

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
      <nav className="wm-subnav glass" aria-label="Work Map">
        <span className="wm-subnav-title">Work Map</span>
        <div className="wm-subnav-links">
          <a href="#wm-guardrails">Guardrails</a>
          <a href="#wm-steps">Steps</a>
          <Link className="button compact" to={`/teach/${map.id}`}>
            Teach a new hire
          </Link>
        </div>
      </nav>

      <header className="wm-band wm-hero">
        <div className="wm-container">
          <p className="wm-eyebrow">Learned from {expert}</p>
          <h1>{map.title}</h1>
          <p className="wm-tagline">
            {map.confirmed_at
              ? `Confirmed by ${expert} on ${formatConfirmed(map.confirmed_at)}.`
              : `Draft. ${expert} has not confirmed the teach-back yet.`}
          </p>
          <dl className="wm-stats">
            <div>
              <dt>steps</dt>
              <dd>{map.steps.length}</dd>
            </div>
            <div>
              <dt>judgment calls</dt>
              <dd>{judgmentCalls}</dd>
            </div>
            <div>
              <dt>guardrails</dt>
              <dd>{map.guardrails.length}</dd>
            </div>
          </dl>

          <div className="wm-ctas">
            <Link className="button" to={`/teach/${map.id}`}>
              Teach a new hire
            </Link>
            <a className="button ghost" href="#wm-steps">
              Read the steps
            </a>
          </div>

          {heroStep && (
            <figure className="wm-shot">
              <button
                type="button"
                className="wm-shot-frame"
                onClick={() => show(heroStep.frame_ts, `Step ${heroStep.index} · ${heroStep.title}`)}
                aria-label={`Enlarge screen moment at ${formatTs(heroStep.frame_ts)}`}
              >
                <img src={frameUrl(sessionId, heroStep.frame_ts)} alt={`${expert}'s screen during "${heroStep.title}"`} />
              </button>
              <figcaption>
                Step {heroStep.index} at {formatTs(heroStep.frame_ts)}: {heroStep.title.toLowerCase()}.
              </figcaption>
            </figure>
          )}
        </div>
      </header>

      {map.guardrails.length > 0 && (
        <section id="wm-guardrails" className="wm-band alt" aria-labelledby="wm-guardrails-title">
          <div className="wm-container">
            <h2 id="wm-guardrails-title">Guardrails</h2>
            <p className="wm-intro">
              {selected
                ? 'The highlighted steps follow this rule. Select it again to clear.'
                : `The rules ${expert} applies. Select one to see the steps it governs.`}
            </p>
            <div className="wm-guardrail-list">
              {map.guardrails.map((g) => (
                <article key={g.id} className="wm-card wm-guardrail" aria-current={selected === g.id}>
                  <button type="button" className="wm-guardrail-main" aria-pressed={selected === g.id} onClick={() => toggle(g.id)}>
                    <span className="wm-kind">{kindLabel[g.kind]}</span>
                    <span className="wm-guardrail-statement">{g.statement}</span>
                  </button>
                  <p className="wm-guardrail-quote">“{g.reason.text}”</p>
                  <p className="wm-attrib">
                    {g.reason.speaker}, {sourceLabel[g.reason.source]}
                  </p>
                  <div className="wm-moment-row">
                    <button type="button" className="link more" onClick={() => show(g.frame_ts, g.statement)}>
                      Screen moment {formatTs(g.frame_ts)}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="wm-steps" className="wm-band" aria-labelledby="wm-steps-title">
        <div className="wm-container">
          <h2 id="wm-steps-title">Steps</h2>
          <p className="wm-intro">What {expert} did, in order, and why. Judgment calls are marked.</p>
          <ol className={`wm-steps ${selected ? 'filtering' : ''}`}>
            {map.steps.map((step) => {
              const rails = map.guardrails.filter((g) => step.guardrail_ids.includes(g.id))
              const lit = selectedGuardrail ? governs(selectedGuardrail, step) : false
              return (
                <li
                  key={step.index}
                  id={`step-${step.index}`}
                  className={`wm-card wm-step ${step.is_judgment_call ? 'judgment' : ''} ${lit ? 'lit' : ''}`}
                >
                  <p className="wm-step-eyebrow">
                    <span>
                      Step {step.index} · {formatTs(step.frame_ts)}
                    </span>
                    {step.is_judgment_call && <span className="wm-flag">Judgment call</span>}
                  </p>
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
                      <div>
                        <p className="wm-label">Decision</p>
                        <p className="wm-decision">{step.decision}</p>
                      </div>
                      <blockquote className="wm-quote">
                        <p>“{step.reason.text}”</p>
                        <footer>
                          {step.reason.speaker},{' '}
                          <button
                            type="button"
                            className="link more"
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
                                <span className="wm-kind">{kindLabel[g.kind]}</span>
                                <span className="wm-rule">{g.statement}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      {map.open_questions.length > 0 && (
        <section className="wm-band alt" aria-labelledby="wm-open-title">
          <div className="wm-container">
            <h2 id="wm-open-title">Still unclear</h2>
            <ul className="wm-open">
              {map.open_questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {moment && <FrameViewer moment={moment} onClose={() => setMoment(null)} />}
    </div>
  )
}
