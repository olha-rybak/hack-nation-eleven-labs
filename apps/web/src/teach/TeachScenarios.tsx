import { useState } from 'react'
import { Link } from 'react-router'
import { useWorkMap } from '../workmap/useWorkMap'
import { frameUrl } from '../workmap/api'
import { TutorPresentation, type TutorEvidence, type TutorView } from './TutorPresentation'
import './teach.css'

type Scenario = 'coaching' | 'prediction' | 'intervention' | 'resolved' | 'finished' | 'disconnected'
const scenarios: { kind: Scenario; label: string }[] = [
  { kind: 'coaching', label: 'Coaching' }, { kind: 'prediction', label: 'Prediction' },
  { kind: 'intervention', label: 'Intervention' }, { kind: 'resolved', label: 'Resolved' },
  { kind: 'finished', label: 'Report' }, { kind: 'disconnected', label: 'Connection lost' },
]

export function TeachScenarios({ workMapId }: { workMapId: string }) {
  const result = useWorkMap(workMapId)
  const [scenario, setScenario] = useState<Scenario>('prediction')
  const [revealed, setRevealed] = useState(false)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)
  const [frameFailed, setFrameFailed] = useState(false)
  function select(kind: Scenario) { setScenario(kind); setRevealed(false); setReason(''); setFrameFailed(false) }
  if (result.status !== 'ready') return <main className="teach-workspace"><h1>Design scenarios</h1><p role="status">{result.status === 'loading' ? 'Loading reference Work Map…' : 'The reference Work Map is unavailable.'}</p><Link to={`/teach/${encodeURIComponent(workMapId)}`}>Return to practice</Link></main>
  const map = result.map
  const step = map.steps.find(s => s.is_judgment_call) ?? map.steps[0]
  const guardrail = map.guardrails.find(g => g.step_index === step?.index)
  const evidence: TutorEvidence | null = !step || missing ? null : {
    sessionId: map.session_id, timestamp: scenario === 'intervention' && guardrail ? guardrail.frame_ts : step.frame_ts,
    decision: scenario === 'intervention' && guardrail ? guardrail.statement : step.decision,
    quote: scenario === 'intervention' && guardrail ? guardrail.reason : step.reason,
  }
  let view: TutorView
  if (scenario === 'coaching') view = { kind: scenario, title: step?.title ?? 'No current step', stepNumber: step?.index ?? 0, totalSteps: map.steps.length, evidence }
  else if (scenario === 'prediction' || scenario === 'intervention') view = { kind: scenario, title: scenario === 'prediction' ? 'What would you do next?' : 'What would make the expert pause here?', prompt: 'Explain the checks you would make before committing your decision.', revealed, evidence }
  else if (scenario === 'resolved') view = { kind: scenario, title: 'Ready to continue.', message: 'Sample resolution: the tutor confirmed that the issue was addressed. This preview did not evaluate a real edit.' }
  else if (scenario === 'finished') view = { kind: scenario, report: missing ? null : { mastered: ['Identified the invoice’s equipment purchase.'], missed: ['Did not check the asset number before choosing capex.'], guardrails: guardrail ? [{ statement: guardrail.statement, resolution: 'Sample: stopped before Save and changed the coding.' }] : [], practiceNext: ['Try another equipment invoice and explain the asset check.'] } }
  else view = { kind: scenario, message: 'Sample connection failure. Your Work Map stays available.' }

  return <main className="teach-workspace">
    <header className="teach-heading"><div><p className="teach-eyebrow">Teach / State previews</p><h1>{map.title}</h1><p className="teach-description">UI samples only. No capture, tutor evaluation or live intervention is running.</p></div><Link className="teach-text-link" to={`/teach/${encodeURIComponent(workMapId)}`}>Return to practice →</Link></header>
    <div className="teach-scenario-bar"><label htmlFor="teach-scenario">Preview scenario</label><select id="teach-scenario" value={scenario} onChange={event => select(event.target.value as Scenario)}>{scenarios.map(s => <option key={s.kind} value={s.kind}>{s.label}</option>)}</select><label className="teach-missing-toggle"><input type="checkbox" checked={missing} onChange={event => setMissing(event.target.checked)} /> Missing evidence / report</label></div>
    <p className="teach-preview-disclosure">Sample prompt, resolution and assessment. Expert evidence is loaded from the {import.meta.env.VITE_MOCK === '1' ? 'fixture' : 'selected'} Work Map.</p>
    <div className="teach-grid">
      <section className="teach-canvas teach-scenario-screen" aria-label="Trainee screen preview">
        <div className="teach-canvas-label"><span>Screen placement preview</span><span>Not a live trainee screen</span></div>
        {(scenario === 'prediction' || scenario === 'intervention') && !revealed ? <div className="teach-neutral-screen"><h2>Trainee workspace</h2><p>The live trainee screen belongs here. Expert reference frames stay hidden until evidence is revealed.</p></div> : step && !frameFailed ? <img className="teach-sample-screen" src={frameUrl(map.session_id, step.frame_ts)} alt="Recorded ERP frame used to demonstrate trainee screen placement" onError={() => setFrameFailed(true)} /> : <p className="teach-notice">No recorded screen is available for this preview.</p>}
        <p className="teach-eyebrow">{(scenario === 'prediction' || scenario === 'intervention') && !revealed ? 'Reference evidence will appear only after reveal.' : 'Recorded expert frame used as a layout placeholder. A live capture will occupy this area.'}</p>
        <div className="teach-voice-dock teach-glass"><div><strong>Voice tutor</strong><span>Disconnected · scenario preview</span></div></div>
      </section>
      <aside className="teach-guidance" aria-label="Tutor guidance"><p className="teach-preview-disclosure">Sample state · not a live tutor result</p><TutorPresentation view={view} reason={reason} onReason={setReason} onReveal={() => setRevealed(true)} onContinue={() => select('coaching')} /></aside>
    </div>
  </main>
}
