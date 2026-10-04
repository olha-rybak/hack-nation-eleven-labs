import { useState } from 'react'
import { formatTs } from '../lib/time'
import type { WorkMap } from '../types/workmap'
import { frameUrl } from '../workmap/api'
import { TeachFrameViewer } from './TeachFrameViewer'
import { TutorPresentation, type TutorView } from './TutorPresentation'
import { hitFrameTs, type GuardrailHit } from './tutorCues'

export interface Intervention {
  hit: GuardrailHit
  id: string
  resolved: boolean
}

/** The current intervention in the guidance column. Question first, the expert's decision and words
 * on reveal (the frame goes next to the trainee's screen, see ExpertReplay); "resolved" only when
 * the server says the rule is no longer broken. */
export function TeachLive({ intervention, map, revealed, onReveal, onClose }: {
  intervention: Intervention; map: WorkMap; revealed: boolean; onReveal: () => void; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const { hit } = intervention
  const ts = hitFrameTs(hit, map)
  const quote = hit.reason
  const view: TutorView = intervention.resolved
    ? { kind: 'resolved', title: 'Handled before saving.', message: `${hit.entity} no longer breaks the rule. In ${quote.speaker}’s words: “${quote.text}”` }
    : {
        kind: 'intervention',
        title: `${quote.speaker} would stop here.`,
        prompt: `Why do you think? Look at ${hit.entity} before you save.`,
        revealed,
        evidence: ts == null ? null : { sessionId: hit.source_session_id, timestamp: ts, decision: hit.statement, quote, showFrame: false },
      }
  return <TutorPresentation view={view} reason={reason} onReason={setReason} onReveal={onReveal} onContinue={() => { setReason(''); onClose() }} />
}

/** The expert's screen at this rule, replayed next to the trainee's own screen (T-301). */
export function ExpertReplay({ hit, map }: { hit: GuardrailHit; map: WorkMap }) {
  const ts = hitFrameTs(hit, map)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  if (ts == null) return null
  const src = frameUrl(hit.source_session_id, ts)
  return <figure className="teach-replay" aria-label={`${hit.reason.speaker}’s screen`}>
    <figcaption><span>{hit.reason.speaker}’s screen</span><span>{formatTs(ts)}</span></figcaption>
    {failed ? <p className="teach-notice" role="status">This screen moment is unavailable. The expert’s words are in the guidance.</p>
      : <button type="button" className="teach-replay-frame" onClick={() => setExpanded(true)} aria-label="Enlarge the expert’s screen"><img src={src} alt={`${hit.reason.speaker}’s screen at ${formatTs(ts)}`} onError={() => setFailed(true)} /></button>}
    {expanded && <TeachFrameViewer src={src} ts={ts} caption={hit.statement} onClose={() => setExpanded(false)} />}
  </figure>
}
