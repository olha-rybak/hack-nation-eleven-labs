import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fixture from '../../../server/tests/fixtures/workmap_guardrails.json'
import type { WorkMap } from '../types/workmap'
import { ExpertReplay, TeachLive } from './TeachLive'
import { currentIntervention, hitFrameTs, hitKey, type GuardrailHit } from './tutorCues'
import { toTutorReport } from './useTutorReport'

const map = fixture as WorkMap
const rule = map.guardrails[0]
const hit: GuardrailHit = {
  guardrail_id: rule.id, severity: 'stop', statement: rule.statement, reason: rule.reason,
  entity: 'invoice 4471', event_id: 'e1', frame_refs: ['frames/0000192000.jpg'],
  source_session_id: map.session_id, timing: 'on_edit', ts_ms: 2000,
}
const render = (resolved = new Set<string>(), revealed = false) => {
  const current = currentIntervention([hit], resolved)!
  return renderToStaticMarkup(<TeachLive intervention={current} map={map} revealed={revealed} onReveal={() => {}} onClose={() => {}} />)
}

describe('live intervention', () => {
  it('asks first and keeps the rule and quote back until reveal', () => {
    const html = render()
    expect(html).toContain(`${rule.reason.speaker} would stop here.`)
    expect(html).not.toContain(rule.statement)
    expect(html).not.toContain(rule.reason.text.replaceAll("'", '&#x27;'))
    expect(html).toContain('Show expert evidence')
  })

  it('says resolved only when the server resolved it, ending with the exact quote', () => {
    const html = render(new Set([hitKey(hit)]))
    expect(html).toContain('Handled before saving.')
    expect(html).toContain(rule.reason.text.replaceAll("'", '&#x27;'))
  })

  it('on reveal shows the decision and words, the frame goes next to the screen instead', () => {
    const html = render(new Set(), true)
    expect(html).toContain(rule.statement)
    expect(html).not.toContain('<img')
    const replay = renderToStaticMarkup(<ExpertReplay hit={hit} map={map} />)
    expect(replay).toContain(`${rule.reason.speaker}’s screen`)
    expect(replay).toContain('<img')
  })

  it('an open intervention wins over a newer resolved one', () => {
    const other = { ...hit, guardrail_id: map.guardrails[1].id, statement: map.guardrails[1].statement }
    const current = currentIntervention([other, hit], new Set([hitKey(hit)]))!
    expect(current.hit.guardrail_id).toBe(other.guardrail_id)
    expect(current.resolved).toBe(false)
  })

  it('nothing to show without a hit', () => {
    expect(currentIntervention([], new Set())).toBeNull()
  })

  it('finds the expert frame from the map, else from the frame ref', () => {
    expect(hitFrameTs(hit, map)).toBe(rule.frame_ts)
    expect(hitFrameTs({ ...hit, guardrail_id: 'unknown' }, map)).toBe(192000)
  })

  it('maps the server report without inventing anything', () => {
    expect(toTutorReport({ mastered: ['A'], missed: [], practice_next: ['C'],
      guardrails: [{ statement: 'S', resolution: 'R' }] })).toEqual(
      { mastered: ['A'], missed: [], guardrails: [{ statement: 'S', resolution: 'R' }], practiceNext: ['C'] })
  })
})
