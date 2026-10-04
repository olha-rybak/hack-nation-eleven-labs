import { useState } from 'react'
import type { WorkMap } from '../types/workmap'
import { TutorPresentation, type TutorView } from './TutorPresentation'
import { hitFrameTs, hitKey, type GuardrailHit } from './tutorCues'

/** The latest intervention on the live tutor session. Question first, the expert's evidence on
 * reveal; it turns into "resolved" only when the server says the rule is no longer broken. */
export function TeachLive({ hits, resolved, map }: { hits: GuardrailHit[]; resolved: Set<string>; map: WorkMap }) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  // The newest open intervention first; once none is open, the newest one as resolved.
  const latest = hits.findLast((h) => !resolved.has(hitKey(h))) ?? hits.at(-1)
  if (!latest) return null
  const id = `${hitKey(latest)}#${hits.lastIndexOf(latest)}`
  if (closed === id) return null
  const ts = hitFrameTs(latest, map)
  const quote = latest.reason
  const view: TutorView = resolved.has(hitKey(latest))
    ? { kind: 'resolved', title: 'Fixed before saving.', message: `${latest.entity} no longer breaks the rule. In ${quote.speaker}’s words: “${quote.text}”` }
    : {
        kind: 'intervention',
        title: `${quote.speaker} would stop here.`,
        prompt: `Why do you think? Look at ${latest.entity} before you save.`,
        revealed: revealed === id,
        evidence: ts == null ? null : { sessionId: latest.source_session_id, timestamp: ts, decision: latest.statement, quote },
      }
  return <TutorPresentation view={view} reason={reason} onReason={setReason} onReveal={() => setRevealed(id)} onContinue={() => { setClosed(id); setReason('') }} />
}
