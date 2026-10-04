import { useEffect, useRef } from 'react'
import type { Quote } from '../types/workmap'
import { TeachEvidence } from './TeachEvidence'

/** Local presentation props, not a websocket or server contract. */
export interface TutorEvidence {
  sessionId: string
  timestamp: number
  decision: string
  quote: Quote
  /** false when the frame is shown elsewhere, e.g. next to the trainee's screen */
  showFrame?: boolean
}
export interface TutorGuardrailOutcome {
  statement: string
  /** How the trainee resolved it, as supplied by the tutor (T-303). */
  resolution: string
}
export interface TutorReport {
  mastered: string[]
  missed: string[]
  guardrails?: TutorGuardrailOutcome[]
  practiceNext: string[]
}
export type TutorView =
  | { kind: 'coaching'; title: string; stepNumber: number; totalSteps: number; evidence: TutorEvidence | null }
  | { kind: 'prediction'; title: string; prompt: string; revealed: boolean; evidence: TutorEvidence | null }
  | { kind: 'intervention'; title: string; prompt: string; revealed: boolean; evidence: TutorEvidence | null }
  | { kind: 'resolved'; title: string; message: string }
  | { kind: 'finished'; report: TutorReport | null }
  | { kind: 'disconnected'; message: string }

export function TutorPresentation({ view, reason, onReason, onReveal, onContinue }: {
  view: TutorView
  reason: string
  onReason: (value: string) => void
  onReveal: () => void
  onContinue: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const identity = `${view.kind}:${'revealed' in view ? view.revealed : ''}:${'title' in view ? view.title : ''}`
  const previous = useRef(identity)
  useEffect(() => {
    if (previous.current !== identity) heading.current?.focus()
    previous.current = identity
  }, [identity])
  const title = view.kind === 'finished' ? 'Your practice report' : view.kind === 'disconnected' ? 'Tutor connection lost.' : view.title
  const evidence = 'evidence' in view ? view.evidence : null
  const questioning = view.kind === 'prediction' || view.kind === 'intervention'
  const showEvidence = view.kind === 'coaching' || (questioning && view.revealed)

  return <section className="teach-presentation" aria-label="Tutor state">
    <p className="teach-eyebrow">{view.kind === 'coaching' ? `Step ${view.stepNumber} of ${view.totalSteps}` : view.kind === 'prediction' ? 'Predict the next decision' : view.kind === 'intervention' ? 'Pause and consider' : view.kind === 'resolved' ? 'Resolution confirmed by tutor' : view.kind === 'finished' ? 'End of case' : 'Connection interrupted'}</p>
    <h2 tabIndex={-1} ref={heading}>{title}</h2>
    {questioning && <>
      <p className="teach-guidance-description">{view.prompt}</p>
      {!view.revealed && <div className="teach-response"><label htmlFor="teach-prediction-reason">Your reasoning</label><textarea id="teach-prediction-reason" value={reason} onChange={event => onReason(event.target.value)} /><button type="button" className="teach-button teach-glass" onClick={onReveal}>Show expert evidence →</button></div>}
    </>}
    {showEvidence && (evidence ? <TeachEvidence key={`${evidence.sessionId}:${evidence.timestamp}:${view.kind}`} {...evidence} /> : <p className="teach-notice" role="status">The expert’s recorded evidence is unavailable for this step.</p>)}
    {view.kind === 'intervention' && <p className="teach-guidance-description">This is guidance. The ERP’s Save action is not blocked by this overlay.</p>}
    {view.kind === 'resolved' && <p className="teach-guidance-description" role="status">{view.message}</p>}
    {view.kind === 'disconnected' && <p className="teach-notice" role="alert">{view.message} Tutor guidance is unavailable until the connection returns.</p>}
    {view.kind === 'finished' && (view.report ? <div className="teach-report">
      <ReportList title="Mastered" items={view.report.mastered} empty="No mastered skills were reported." />
      <ReportList title="Needs another attempt" items={view.report.missed} empty="No missed skills were reported." />
      <ReportList title="Guardrails hit" items={(view.report.guardrails ?? []).map(g => `${g.statement} — ${g.resolution}`)} empty="No guardrail outcomes were reported." />
      <ReportList title="Practise next" items={view.report.practiceNext} empty="No follow-up practice was supplied." />
    </div> : <p className="teach-notice" role="status">The tutor has not supplied a report yet. No assessment can be inferred from this session.</p>)}
    {/* Dismissing an intervention must never imply resolution. Only a new supplied view can do that. */}
    {(view.kind === 'resolved' || view.kind === 'finished' || view.kind === 'disconnected') && <button type="button" className="teach-button teach-glass" onClick={onContinue}>{view.kind === 'disconnected' ? 'Retry connection' : view.kind === 'finished' ? 'Open in Vault' : 'Continue practice →'}</button>}
  </section>
}

function ReportList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{empty}</p>}</section>
}
