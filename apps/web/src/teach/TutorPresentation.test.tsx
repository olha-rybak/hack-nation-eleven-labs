import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TutorPresentation, type TutorEvidence, type TutorView } from './TutorPresentation'
const evidence: TutorEvidence = { sessionId: 'test', timestamp: 192000, decision: 'EXPERT_DECISION_SECRET', quote: { text: 'EXPERT_QUOTE_SECRET', speaker: 'Expert', ts_ms: 195000, source: 'narration' } }
const render = (view: TutorView) => renderToStaticMarkup(<TutorPresentation view={view} reason="" onReason={() => {}} onReveal={() => {}} onContinue={() => {}} />)

describe('tutor presentation boundaries', () => {
  it.each(['prediction', 'intervention'] as const)('does not expose the expert answer or frame before reveal in %s', kind => {
    const html = render({ kind, title: 'Decide', prompt: 'Explain why', revealed: false, evidence })
    expect(html).not.toContain('EXPERT_DECISION_SECRET')
    expect(html).not.toContain('EXPERT_QUOTE_SECRET')
    expect(html).not.toContain('<img')
    expect(html).toContain('Show expert evidence')
  })
  it('shows supplied evidence without inventing resolution', () => {
    const html = render({ kind: 'intervention', title: 'Pause', prompt: 'Explain why', revealed: true, evidence })
    expect(html).toContain('EXPERT_QUOTE_SECRET')
    expect(html).toContain('EXPERT_DECISION_SECRET')
    expect(html).not.toContain('Resolution confirmed')
    expect(html).toContain('not blocked')
  })
  it('does not infer mastered skills when no assessment exists', () => {
    const html = render({ kind: 'finished', report: null })
    expect(html).toContain('has not supplied a report')
    expect(html).not.toContain('Mastered')
  })
  it('does not invent guardrail outcomes when none are supplied', () => {
    const html = render({ kind: 'finished', report: { mastered: [], missed: [], practiceNext: [] } })
    expect(html).toContain('No guardrail outcomes were reported.')
  })
  it('renders all supplied report sections', () => {
    const html = render({ kind: 'finished', report: { mastered: ['A'], missed: ['B'], guardrails: [{ statement: 'RULE_X', resolution: 'RESOLVED_Y' }], practiceNext: ['C'] } })
    expect(html).toContain('Mastered')
    expect(html).toContain('Needs another attempt')
    expect(html).toContain('Guardrails hit')
    expect(html).toContain('RULE_X — RESOLVED_Y')
    expect(html).toContain('Practise next')
  })
})

// The complete preview must also hide the reference frame in the main stage.
// Checking only the guidance panel would miss an answer leaked by the screenshot.
