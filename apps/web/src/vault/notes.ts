import { formatTs } from '../lib/time'
import type { Guardrail, GuardrailKind, Quote, Step, WorkMap } from '../types/workmap'

export type NoteKind = 'index' | 'step' | 'judgment' | 'stop' | 'guardrail' | 'question'
export type NoteFolder = 'Steps' | 'Guardrails' | 'Questions' | ''

export interface Note {
  id: string
  title: string
  folder: NoteFolder
  kind: NoteKind
  tags: string[] // without the leading #
  props: Record<string, string>
  body: string
  frameTs?: number
}

export interface GraphNode {
  id: string
  title: string
  kind: NoteKind
}

export interface GraphEdge {
  source: string
  target: string
}

export const INDEX_ID = 'index'

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

const formatConfirmed = (iso: string) => {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day} at ${time}`
}

// Titles end up inside [[wikilinks]], so keep link syntax characters out of them.
const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[|[\]]/g, '-').trim()

function shorten(text: string, max = 48): string {
  const first = clean(text.split(/[.;]/)[0] ?? text)
  if (first.length <= max) return first
  const cut = first.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 12)).replace(/[\s,]+$/, '')}…`
}

const quoteBlock = (q: Quote) =>
  `> “${q.text.replace(/\s+/g, ' ')}”\n> — ${q.speaker}, ${sourceLabel[q.source]} at ${formatTs(q.ts_ms)}`

export function buildNotes(map: WorkMap): Note[] {
  const expert = expertName(map)
  const used = new Set<string>([INDEX_ID])
  const unique = (title: string, suffix: string) => {
    const t = used.has(title) ? `${title} (${suffix})` : title
    used.add(t)
    return t
  }

  const stepTitle = new Map(map.steps.map((s) => [s.index, unique(`Step ${s.index} · ${clean(s.title)}`, String(s.index))]))
  const guardTitle = new Map(
    map.guardrails.map((g) => [g.id, unique(`${kindLabel[g.kind]} · ${shorten(g.statement) || g.id}`, g.id)]),
  )
  const questionTitle = map.open_questions.map((q, i) => unique(`Question ${i + 1} · ${shorten(q)}`, String(i + 1)))

  const mapTitle = clean(map.title)
  // The index note is always linked by id with its map title as the alias.
  const ref = (id: string) => (id === INDEX_ID ? `[[${INDEX_ID}|${mapTitle}]]` : `[[${id}]]`)
  const indexRef = ref(INDEX_ID)

  const judgmentCalls = map.steps.filter((s) => s.is_judgment_call).length
  const status = map.confirmed_at ? `Confirmed ${formatConfirmed(map.confirmed_at)}` : 'Draft'

  const list = (items: string[], ordered = false) => items.map((t, i) => `${ordered ? `${i + 1}.` : '-'} ${t}`).join('\n')

  const index: Note = {
    id: INDEX_ID,
    title: mapTitle,
    folder: '',
    kind: 'index',
    tags: ['work-map', 'index'],
    props: { expert, status, session: map.session_id },
    body: [
      '## Overview',
      `${expert} walked through this task: **${map.steps.length} steps**, **${judgmentCalls} judgment calls** and **${map.guardrails.length} guardrails**. ${status}.`,
      '## Steps',
      list(
        map.steps.map((s) => ref(stepTitle.get(s.index)!)),
        true,
      ),
      '## Guardrails',
      map.guardrails.length ? list(map.guardrails.map((g) => ref(guardTitle.get(g.id)!))) : 'None captured.',
      '## Open questions',
      questionTitle.length ? list(questionTitle.map(ref)) : 'None.',
    ].join('\n\n'),
  }

  const steps: Note[] = map.steps.map((s, i) => {
    const prev = map.steps[i - 1]
    const next = map.steps[i + 1]
    const rails = map.guardrails.filter((g) => governs(g, s))
    const nav = [
      prev ? `Previous: ${ref(stepTitle.get(prev.index)!)}` : null,
      next ? `Next: ${ref(stepTitle.get(next.index)!)}` : null,
      `Back to ${indexRef}`,
    ].filter((l): l is string => l !== null)
    const title = stepTitle.get(s.index)!
    return {
      id: title,
      title,
      folder: 'Steps',
      kind: s.is_judgment_call ? 'judgment' : 'step',
      tags: s.is_judgment_call ? ['step', 'judgment-call'] : ['step'],
      props: {
        index: String(s.index),
        frame: formatTs(s.frame_ts),
        'judgment call': s.is_judgment_call ? 'yes' : 'no',
      },
      frameTs: s.frame_ts,
      body: [
        '## Decision',
        s.decision,
        '## Why',
        quoteBlock(s.reason),
        ...(rails.length ? ['## Governed by', list(rails.map((g) => ref(guardTitle.get(g.id)!)))] : []),
        '## Sequence',
        list(nav),
      ].join('\n\n'),
    }
  })

  const guardrails: Note[] = map.guardrails.map((g) => {
    const applies = map.steps.filter((s) => governs(g, s))
    const check = g.check
    const title = guardTitle.get(g.id)!
    return {
      id: title,
      title,
      folder: 'Guardrails',
      kind: check?.severity === 'stop' ? 'stop' : 'guardrail',
      tags: ['guardrail', g.kind.replace('_', '-')],
      props: {
        kind: kindLabel[g.kind],
        severity: check?.severity ?? 'none',
        frame: formatTs(g.frame_ts),
        rule: g.id,
      },
      frameTs: g.frame_ts,
      body: [
        '## Statement',
        g.statement,
        '## Why',
        quoteBlock(g.reason),
        ...(check
          ? [
              '## Machine check',
              [
                '```',
                `trigger: ${check.trigger_kind}`,
                `entity: ${check.entity_pattern}`,
                ...(check.field ? [`field: ${check.field}`] : []),
                `condition: ${check.condition}`,
                `severity: ${check.severity}`,
                '```',
              ].join('\n'),
            ]
          : []),
        '## Applies to',
        applies.length ? list(applies.map((s) => ref(stepTitle.get(s.index)!))) : 'No step linked.',
        `Back to ${indexRef}`,
      ].join('\n\n'),
    }
  })

  const questions: Note[] = map.open_questions.map((q, i) => ({
    id: questionTitle[i]!,
    title: questionTitle[i]!,
    folder: 'Questions',
    kind: 'question',
    tags: ['open-question'],
    props: { status: 'open' },
    body: ['## Question', q, `Raised in ${indexRef}`].join('\n\n'),
  }))

  return [index, ...steps, ...guardrails, ...questions]
}

export function parseWikilink(raw: string): { target: string; alias?: string } | null {
  const m = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/.exec(raw)
  return m ? { target: m[1]!.trim(), alias: m[2]?.trim() || undefined } : null
}

const WIKILINK = /\[\[[^\]]+\]\]/g

export function links(note: Note): string[] {
  const out = new Set<string>()
  for (const raw of note.body.match(WIKILINK) ?? []) {
    const target = parseWikilink(raw)?.target
    if (target && target !== note.id) out.add(target)
  }
  return [...out]
}

export function backlinks(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id && links(n).includes(id))
}

export function buildGraph(notes: Note[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const ids = new Set(notes.map((n) => n.id))
  const seen = new Set<string>()
  const edges: GraphEdge[] = []
  for (const n of notes) {
    for (const t of links(n)) {
      if (!ids.has(t)) continue
      const [a, b] = n.id < t ? [n.id, t] : [t, n.id]
      const key = `${a}\u0000${b}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ source: a, target: b })
    }
  }
  return { nodes: notes.map((n) => ({ id: n.id, title: n.title, kind: n.kind })), edges }
}

// Windows-safe file name; wikilinks are rewritten to match in toMarkdown.
export function fileName(title: string): string {
  const name = title
    .replace(/:/g, ' -')
    .replace(/[\\/*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return name || 'note'
}

export function notePath(note: Note): string {
  return `${note.folder ? `${note.folder}/` : ''}${fileName(note.id === INDEX_ID ? INDEX_ID : note.title)}.md`
}

export const frameName = (ts: number) => `frames/${String(ts).padStart(10, '0')}.jpg`

export function toMarkdown(note: Note): string {
  const front = [
    '---',
    'tags:',
    ...note.tags.map((t) => `  - ${t}`),
    ...Object.entries(note.props).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
    '---',
  ]
  const body = note.body.replace(WIKILINK, (raw) => {
    const w = parseWikilink(raw)
    if (!w) return raw
    const safe = fileName(w.target)
    const alias = w.alias ?? (safe === w.target ? undefined : w.target)
    return alias ? `[[${safe}|${alias}]]` : `[[${safe}]]`
  })
  const embed = note.frameTs !== undefined ? `![[${frameName(note.frameTs)}]]\n\n` : ''
  return `${front.join('\n')}\n\n${embed}${body}\n`
}

// Subsequence match: lower is better, -1 when the query does not fit.
export function fuzzy(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, '')
  const t = text.toLowerCase()
  if (!q) return 0
  const at = t.indexOf(query.toLowerCase().trim())
  if (at >= 0) return at
  let pos = -1
  let gaps = 0
  for (const ch of q) {
    const next = t.indexOf(ch, pos + 1)
    if (next < 0) return -1
    if (pos >= 0) gaps += next - pos - 1
    pos = next
  }
  return 100 + gaps
}
