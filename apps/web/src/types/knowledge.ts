// Mirrors a fact in the knowledge graph (apps/server/apprentice/knowledge/graph.py, docs/knowledge-graph.md).

export interface FactQuote {
  text: string
  expert: string
  session_id: string
  date: string
  event_id: string
  frame_ref: string | null
}

export interface Fact {
  id: string
  nodes: string[]
  question: string
  quotes: FactQuote[]
  /** The rule as one plain sentence, written for the expert to review (T-205). */
  rule?: string
  edited?: boolean
  agreed_at?: string | null
}
