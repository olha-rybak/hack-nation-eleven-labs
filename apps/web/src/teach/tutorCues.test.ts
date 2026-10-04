import { describe, expect, it } from 'vitest'
import fixture from '../../../server/tests/fixtures/workmap_guardrails.json'
import type { WorkMap } from '../types/workmap'
import { hitCue, lookupGuardrail, lookupStep, pauseCue, workMapBrief, type GuardrailHit } from './tutorCues'

const map = fixture as WorkMap
const rule = map.guardrails[0]
const hit: GuardrailHit = {
  guardrail_id: rule.id, severity: 'stop', statement: rule.statement, reason: rule.reason,
  entity: 'invoice 4471', event_id: 'e1', frame_refs: [], source_session_id: map.session_id,
  timing: 'on_edit', ts_ms: 2000, known: [{ id: 'f1', text: 'Why 0400? "Over 5,000." (Anna, 2026-10-01)' }],
}

describe('tutor cues', () => {
  it('a stop carries the rule, the expert words verbatim and what is known', () => {
    expect(hitCue(hit)).toBe(
      `STOP\nOn: invoice 4471\nGuardrail: ${rule.statement}\nExpert: "${rule.reason.text}" (${rule.reason.speaker})` +
        '\nKnown:\n- Why 0400? "Over 5,000." (Anna, 2026-10-01)',
    )
    expect(hitCue({ ...hit, severity: 'warn', known: [] }).startsWith('WARN\n')).toBe(true)
  })

  it('the brief lists every step and guardrail with the expert quote', () => {
    const brief = workMapBrief(map)
    for (const s of map.steps) expect(brief).toContain(s.reason.text)
    for (const g of map.guardrails) expect(brief).toContain(`${g.id}: ${g.statement}`)
  })

  it('lookups return the exact wording or say what is missing', () => {
    expect(lookupGuardrail(map, rule.id)).toContain(rule.reason.text)
    expect(lookupGuardrail(map, 'nope')).toBe('No guardrail nope in the Work Map.')
    expect(lookupStep(map, map.steps[0].index)).toContain(map.steps[0].decision)
    expect(lookupStep(map, 999)).toBe('No step 999 in the Work Map.')
  })

  it('a pause leaves out an empty Known list', () => {
    expect(pauseCue({ subject: 'invoice 4471: edit' })).toBe('PAUSE\nSubject: invoice 4471: edit')
  })
})
