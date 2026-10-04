import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CaptureView } from '../capture/CaptureView'
import { useScreenCapture } from '../capture/useScreenCapture'
import { useWorkMap } from '../workmap/useWorkMap'
import type { WorkMap } from '../types/workmap'
import { TeachEvidence } from './TeachEvidence'
import { ExpertReplay, TeachLive } from './TeachLive'
import { currentIntervention } from './tutorCues'
import { TutorPresentation } from './TutorPresentation'
import { useTutor, type TutorStatus } from './useTutor'
import { useTutorReport } from './useTutorReport'
import './teach.css'

const localCapture = import.meta.env.VITE_MOCK === '1'
const captureErrors = {
  denied: 'Screen sharing was cancelled or denied. Try again and choose the training tab.',
  unsupported: 'Screen sharing is unavailable in this browser. Open this page in a desktop browser with screen-sharing support.',
  offline: 'The recording server is unreachable. Retry when it is available.',
  failed: 'Screen sharing could not start. You can still review the Work Map.',
}
const voiceText: Record<TutorStatus, string> = {
  off: 'Not connected',
  connecting: 'Connecting…',
  listening: 'Listening',
  speaking: 'Speaking',
  error: 'Voice failed',
}

export function TeachWorkspace({ workMapId }: { workMapId: string }) {
  const [attempt, setAttempt] = useState(0)
  return <LoadedWorkspace key={`${workMapId}:${attempt}`} workMapId={workMapId} retry={() => setAttempt(attempt + 1)} />
}

function LoadedWorkspace({ workMapId, retry }: { workMapId: string; retry: () => void }) {
  const result = useWorkMap(workMapId)
  if (result.status !== 'ready') return <main className="teach-workspace">
    <header className="teach-heading"><div><p className="teach-eyebrow">Teach / Work Map {workMapId}</p><h1>{result.status === 'loading' ? 'Loading your Work Map…' : result.status === 'missing' ? 'Work Map not available yet.' : 'Couldn’t load the Work Map.'}</h1></div></header>
    <section className="teach-notice" role={result.status === 'loading' ? 'status' : 'alert'}>
      <p>{result.status === 'loading' ? 'Retrieving the expert’s steps, quotes and screen moments.' : result.status === 'missing' ? 'Complete the expert session and create its Work Map before practising.' : 'Check the server connection and try again.'}</p>
      {result.status === 'error' && <p className="teach-eyebrow">{result.message}</p>}
      {result.status !== 'loading' && <button type="button" className="teach-button teach-glass" onClick={retry}>Retry Work Map</button>}
      <Link className="teach-text-link" to={`/vault/${encodeURIComponent(workMapId)}`}>Open in Vault →</Link>
    </section>
  </main>
  return <Practice map={result.map} workMapId={workMapId} />
}

function Practice({ map, workMapId }: { map: WorkMap; workMapId: string }) {
  const capture = useScreenCapture()
  const navigate = useNavigate()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  // A browser chooser can resolve after navigation. Close that late stream too.
  async function startCapture() {
    // Server mode starts a tutor session on this Work Map, so its events run through the guardrails.
    await capture.start(localCapture ? undefined : { role: 'tutor', work_map_id: workMapId })
    if (!mounted.current) await capture.stop()
  }
  const [stepIndex, setStepIndex] = useState(0)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const guidanceHeading = useRef<HTMLHeadingElement>(null)
  const reasonField = useRef<HTMLTextAreaElement>(null)
  const focusTarget = useRef<'heading' | 'reason' | null>(null)
  useEffect(() => {
    if (focusTarget.current === 'reason') reasonField.current?.focus()
    if (focusTarget.current === 'heading') guidanceHeading.current?.focus()
    focusTarget.current = null
  })
  const [revealed, setRevealed] = useState(false)
  const [ruleId, setRuleId] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [finished, setFinished] = useState(false)
  const steps = [...map.steps].sort((a, b) => a.index - b.index)
  const step = steps[stepIndex]
  const reason = step ? notes[step.index] ?? '' : ''
  function setReason(value: string) {
    if (step) setNotes(current => ({ ...current, [step.index]: value }))
  }
  const rule = map.guardrails.find(g => g.id === ruleId)
  const live = capture.state.status === 'live' || capture.state.status === 'stopping'
  const ended = capture.state.status === 'ended'
  const confirmed = Boolean(map.confirmed_at)
  const canShare = confirmed && Boolean(step) && !finished
  const state = capture.state
  const tutor = useTutor(
    !localCapture && state.status === 'live' ? state.capture.sessionId : null,
    state.status === 'live' ? state.capture.startedAt : null,
    map,
  )
  const intervention = currentIntervention(tutor.hits, tutor.resolved)
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [closedId, setClosedId] = useState<string | null>(null)
  const shown = intervention && intervention.id !== closedId ? intervention : null
  const alerting = Boolean(shown && !shown.resolved)
  const replaying = Boolean(alerting && shown && revealedId === shown.id)
  const report = useTutorReport(!localCapture && finished && state.status === 'ended' ? state.sessionId : null, workMapId)

  function selectStep(index: number) {
    focusTarget.current = 'heading'
    setStepIndex(index); setRevealed(false); setRuleId(''); setDismissed(false)
  }
  async function finish() {
    if (live) await capture.stop()
    focusTarget.current = 'heading'
    setFinished(true)
  }
  function restart() {
    capture.reset(); setNotes({}); setFinished(false); selectStep(0)
  }

  return <main className="teach-workspace">
    <header className="teach-heading"><div><p className="teach-eyebrow">Teach <span>/</span> Work Map {workMapId}</p><h1>{map.title}</h1><p className="teach-description">Practise on your screen. Compare your reasoning with the expert’s evidence.</p></div><span className="teach-preview-label">{localCapture ? 'Fixture map · local capture test' : 'Work Map review'}</span></header>
    {!confirmed && <section className="teach-notice" role="alert"><strong>This Work Map has not been confirmed.</strong><p>Review it with the expert before starting a capture test.</p><Link className="teach-text-link" to={`/vault/${encodeURIComponent(workMapId)}`}>Review in Vault →</Link></section>}
    {!step && <section className="teach-notice" role="alert"><strong>This Work Map has no steps.</strong><p>Return to the Work Map to check its contents. Practice cannot start yet.</p><Link className="teach-text-link" to={`/vault/${encodeURIComponent(workMapId)}`}>Open in Vault →</Link></section>}
    <div className="teach-session-toolbar">
      <span role="status">{finished ? 'Practice ended' : live ? capture.state.status === 'stopping' ? 'Stopping capture…' : 'Screen sharing active' : ended ? 'Screen sharing ended' : 'Ready to review'}</span>
      <Link className="teach-text-link" to={`/teach/${encodeURIComponent(workMapId)}?preview=1`}>View design scenarios</Link>
      {!finished && step && <button type="button" className="teach-button teach-glass" onClick={() => void finish()} disabled={capture.state.status === 'requesting' || capture.state.status === 'stopping'}>Finish practice</button>}
    </div>
    <div className={`teach-grid teach-live-grid${alerting ? ' teach-alerting' : ''}`}>
      <section className="teach-canvas" aria-label="Practice workspace">
        <div className="teach-canvas-label"><span>Your workspace</span><span>{live ? 'Shared screen' : 'Not sharing'}</span></div>
        {live ? <div className={replaying ? 'teach-split' : undefined}><div className="teach-capture-host"><CaptureView capture={capture} /></div>{replaying && shown && <ExpertReplay hit={shown.hit} map={map} />}</div> : <div className="teach-start">
          <div className="teach-start-copy"><h2>{finished ? 'Your practice has ended.' : ended ? 'Screen sharing has ended.' : 'Start with your screen.'}</h2><p>{finished ? (report.status === 'ready' ? 'Your report is on the right. Start another practice to try again.' : 'Your Work Map remains available in the Vault.') : 'Open the training case in another tab, then share that tab. You can also review the expert’s steps without sharing.'}</p>
            {!finished && <div className="teach-start-actions"><button className="teach-button teach-primary" type="button" disabled={!canShare || capture.state.status === 'requesting'} onClick={() => void startCapture()}>{capture.state.status === 'requesting' ? 'Choose a screen in your browser…' : ended ? 'Share screen again' : 'Share screen'}</button><a className="teach-text-link" href="/shop?case=training" target="_blank" rel="noreferrer">Open training case ↗</a></div>}
            {finished && <button className="teach-button teach-primary" type="button" onClick={restart}>Start another practice</button>}
            {capture.state.status === 'error' && <p className="teach-capture-error" role="alert">{captureErrors[capture.state.reason]}</p>}
            {!localCapture && !finished && <small>The tutor watches the shared tab and speaks up before a step the expert would stop at. It uses your microphone.</small>}
            {localCapture && !finished && <small>Screen capture uses the existing local test loop. No frames leave this browser; microphone and tutor voice are not connected.</small>}
            {ended && <small>{capture.state.status === 'ended' && `${capture.state.stats.ticks} frames checked · ${capture.state.stats.changed} changed · ${capture.state.stats.failed} failed`}</small>}
          </div>
        </div>}
        <div className="teach-voice-dock teach-glass"><div><strong>Voice tutor</strong><span role="status">{localCapture ? 'Not connected · local capture test' : `${voiceText[tutor.status]}${tutor.error ? ` (${tutor.error})` : ''}`}</span></div><span className="teach-dock-marker" aria-hidden="true" /></div>
      </section>
      <aside className="teach-guidance" aria-label="Tutor guidance">
        {finished && report.status === 'ready' ? <TutorPresentation view={{ kind: 'finished', report: report.report }} reason="" onReason={() => {}} onReveal={() => {}} onContinue={() => navigate(`/vault/${encodeURIComponent(workMapId)}`)} /> : finished && report.status === 'loading' ? <p role="status">Building your practice report…</p> : finished ? <section aria-label="Practice report"><p className="teach-eyebrow">End of practice</p><h2 tabIndex={-1} ref={guidanceHeading}>Report not available yet.</h2><p className="teach-guidance-description">No tutor assessment was received. Reviewing evidence or ending a capture does not establish which skills you mastered.</p><Link className="teach-text-link" to={`/vault/${encodeURIComponent(workMapId)}`}>Return to Vault →</Link></section> : step ? <>
          {shown && <TeachLive key={shown.id} intervention={shown} map={map} revealed={revealedId === shown.id} onReveal={() => setRevealedId(shown.id)} onClose={() => setClosedId(shown.id)} />}
          {!alerting && <>
          <div className="teach-guidance-head"><label className="teach-eyebrow" htmlFor="teach-step">Step {stepIndex + 1} of {steps.length}</label><span className="teach-step-mark">Manual review</span></div>
          <select className="teach-step-select" id="teach-step" value={stepIndex} onChange={e => selectStep(Number(e.target.value))}>{steps.map((s, index) => <option key={s.index} value={index}>{s.index}. {s.title}</option>)}</select>
          <h2 tabIndex={-1} ref={guidanceHeading}>{step.title}</h2><p className="teach-guidance-description">{localCapture ? 'Step selection is manual. The tutor is not connected in the local capture test.' : 'Browse the expert’s steps. The tutor speaks up on its own when a rule is at risk.'}</p>
          {!revealed && <div className="teach-response"><label htmlFor="teach-reason-live">Your reasoning · local notes</label><textarea ref={reasonField} id="teach-reason-live" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain how you would approach this step." /><button className="teach-button teach-glass" type="button" onClick={() => { focusTarget.current = 'heading'; setRevealed(true); setDismissed(false) }}>Compare with the expert →</button></div>}
          {revealed && <div aria-live="polite"><TeachEvidence key={`${map.id}:${step.index}:${rule?.id ?? ''}`} sessionId={map.session_id} timestamp={rule?.frame_ts ?? step.frame_ts} quote={rule?.reason ?? step.reason} decision={rule?.statement ?? step.decision} />
            {step.guardrail_ids.length > 0 && <div className="teach-rule-reference"><label htmlFor="teach-rule">Rule reference · manually selected</label><select id="teach-rule" value={ruleId} onChange={e => setRuleId(e.target.value)}><option value="">This step’s decision</option>{map.guardrails.filter(g => step.guardrail_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.statement}</option>)}</select><p>No live guardrail detection is running.</p></div>}
            <button className="teach-text-link" type="button" onClick={() => { focusTarget.current = 'reason'; setRevealed(false); setRuleId(''); setDismissed(true) }}>Dismiss evidence</button>
          </div>}
          {dismissed && <p className="teach-guidance-description" role="status">Evidence dismissed. This does not confirm that a guardrail was resolved.</p>}
          <div className="teach-step-navigation"><button className="teach-button teach-glass" type="button" disabled={stepIndex === 0} onClick={() => selectStep(stepIndex - 1)}>Previous step</button><button className="teach-button teach-glass" type="button" disabled={stepIndex === steps.length - 1} onClick={() => selectStep(stepIndex + 1)}>Next step →</button></div>
          </>}
        </> : <p>No guidance is available until this Work Map contains steps.</p>}
      </aside>
    </div>
    <footer className="teach-footer"><span>{localCapture ? 'Fixture data from the existing Work Map API' : `Expert session ${map.session_id}`}</span><span>{localCapture ? 'Local capture test: no tutor session, interventions or report.' : 'Interventions come from the guardrail engine; the report from the server.'}</span></footer>
  </main>
}
