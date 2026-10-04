import { describe, expect, it } from 'vitest'
import fixture from '../../../server/tests/fixtures/workmap_returns.json'
import type { WorkMap } from '../types/workmap'
import { backlinks, buildGraph, buildNotes, fileName, fuzzy, INDEX_ID, links, notePath, toMarkdown } from './notes'

const map = fixture as WorkMap
const notes = buildNotes(map)
const byId = new Map(notes.map((n) => [n.id, n]))

describe('buildNotes', () => {
  it('makes one note per index, step, guardrail and question', () => {
    expect(notes).toHaveLength(1 + map.steps.length + map.guardrails.length)
    expect(notes.filter((n) => n.folder === 'Steps')).toHaveLength(5)
    expect(notes.filter((n) => n.folder === 'Guardrails')).toHaveLength(4)
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length)
  })

  it('adds open questions linked from the index', () => {
    const withQuestions = buildNotes({ ...map, open_questions: ['Who approves gift cards?', 'What about EU returns?'] })
    const questions = withQuestions.filter((n) => n.folder === 'Questions')
    expect(questions).toHaveLength(2)
    expect(questions[0]!.tags).toContain('open-question')
    for (const q of questions) expect(links(withQuestions[0]!)).toContain(q.id)
  })

  it('links steps to the guardrails that govern them', () => {
    const step3 = notes.find((n) => n.title.startsWith('Step 3'))!
    const targets = links(step3)
    expect(targets.filter((t) => byId.get(t)?.folder === 'Guardrails')).toHaveLength(2)
    expect(targets).toContain(INDEX_ID)
  })

  it('lists steps as backlinks of their guardrails', () => {
    const guardrail = notes.find((n) => n.title.startsWith('Never do'))!
    const from = backlinks(notes, guardrail.id).map((n) => n.title)
    expect(from.some((t) => t.startsWith('Step 2'))).toBe(true)
    expect(from).not.toContain(guardrail.title)
  })

  it('shows the machine check only when the guardrail has one', () => {
    const withCheck = notes.find((n) => n.title.startsWith('Limit'))!
    const withoutCheck = notes.find((n) => n.title.startsWith('Exception'))!
    expect(withCheck.body).toContain('```')
    expect(withCheck.body).toContain('condition: amount > 200')
    expect(withoutCheck.body).not.toContain('```')
  })
})

describe('buildGraph', () => {
  it('has no duplicate or dangling edges', () => {
    const { nodes, edges } = buildGraph(notes)
    const ids = new Set(nodes.map((n) => n.id))
    const keys = edges.map((e) => [e.source, e.target].sort().join('|'))
    expect(new Set(keys).size).toBe(keys.length)
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true)
      expect(ids.has(e.target)).toBe(true)
    }
    expect(nodes).toHaveLength(notes.length)
  })
})

describe('toMarkdown', () => {
  it('starts with frontmatter and embeds the frame', () => {
    const step = notes.find((n) => n.title.startsWith('Step 1'))!
    const md = toMarkdown(step)
    expect(md.startsWith('---')).toBe(true)
    expect(md).toContain('  - step')
    expect(md).toContain('![[frames/0000030000.jpg]]')
  })

  it('keeps wikilinks matching the exported file names', () => {
    const names = new Set(notes.map((n) => notePath(n).split('/').pop()!.replace(/\.md$/, '')))
    for (const note of notes) {
      for (const raw of toMarkdown(note).match(/(?<!!)\[\[[^\]]+\]\]/g) ?? []) {
        const target = raw.slice(2, -2).split('|')[0]!
        expect(names.has(target), `${target} in ${note.title}`).toBe(true)
      }
    }
  })
})

describe('fileName', () => {
  it('removes characters Windows forbids', () => {
    expect(fileName('Step 2 · RMA-1042: a/b?')).toBe('Step 2 · RMA-1042 - a-b-')
    expect(/[\\/:*?"<>|]/.test(fileName('x\\y:z*w'))).toBe(false)
  })
})

describe('fuzzy', () => {
  it('matches substrings and subsequences', () => {
    expect(fuzzy('carrier', 'Never do · carrier claim')).toBeGreaterThanOrEqual(0)
    expect(fuzzy('ndcc', 'Never do · carrier claim')).toBeGreaterThan(100)
    expect(fuzzy('zzz', 'Never do')).toBe(-1)
  })
})
