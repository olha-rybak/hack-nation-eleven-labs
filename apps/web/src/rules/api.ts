import type { Fact } from '../types/knowledge'

// Server routes (T-205, docs/knowledge-graph.md):
//   GET    /api/knowledge/review          -> facts not agreed yet, each with its rule sentence; 502 if the LLM fails
//   POST   /api/knowledge/facts/:id/agree -> agree, optionally with the expert's rewrite {rule}
//   DELETE /api/knowledge/facts/:id       -> remove the fact from the knowledge graph
//   POST   /api/sessions/:id/workmap/confirm -> stamp confirmed_at and freeze the Work Map (T-204)

async function detail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // not JSON: fall through to the status
  }
  return `status ${res.status}`
}

function fact(id: string) {
  return `/api/knowledge/facts/${encodeURIComponent(id)}`
}

export async function fetchRulesToReview(signal?: AbortSignal): Promise<Fact[]> {
  const res = await fetch('/api/knowledge/review', { signal })
  if (!res.ok) throw new Error(`Loading the rules failed (${await detail(res)})`)
  return ((await res.json()) as { facts: Fact[] }).facts
}

/** `rule` is the expert's rewrite; leave it out to agree with the sentence as written. */
export async function agreeRule(id: string, rule?: string): Promise<void> {
  const res = await fetch(`${fact(id)}/agree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule === undefined ? {} : { rule }),
  })
  if (!res.ok) throw new Error(`Saving the rule failed (${await detail(res)})`)
}

/** 404 is not an error here: the rule is gone either way. */
export async function deleteRule(id: string): Promise<void> {
  const res = await fetch(fact(id), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`Deleting the rule failed (${await detail(res)})`)
}

/** The expert confirms the Work Map; only a confirmed map can teach (T-204). */
export async function confirmWorkMap(sessionId: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/workmap/confirm`, { method: 'POST' })
  if (!res.ok) throw new Error(`Confirming the Work Map failed (${await detail(res)})`)
}
