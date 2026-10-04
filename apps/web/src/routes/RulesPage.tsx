import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { SessionLayout } from '../components/SessionLayout'
import { agreeRule, deleteRule, fetchRulesToReview } from '../rules/api'
import type { Fact } from '../types/knowledge'
import '../rules/rules.css'

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; facts: Fact[] }

/** After the debrief: every rule not agreed yet, one at a time, to agree with, edit or delete (T-205). */
export function RulesPage() {
  const { sessionId = '' } = useParams()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [done, setDone] = useState(0)
  const mapPath = `/map/${encodeURIComponent(sessionId)}`

  useEffect(() => {
    const controller = new AbortController()
    fetchRulesToReview(controller.signal)
      .then((facts) => setState({ status: 'ready', facts }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => controller.abort()
  }, [attempt])

  const facts = state.status === 'ready' ? state.facts : []
  const current = facts[done]

  return (
    <SessionLayout sessionId={sessionId} panelTitle="Rules">
      {state.status === 'loading' && (
        <div className="placeholder" role="status">
          <h1>Writing up the rules…</h1>
          <p>The apprentice is putting what you told it into plain sentences for you to check.</p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="placeholder">
          <h1>The rules could not be loaded</h1>
          <p>{state.message}.</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && !current && (
        <div className="placeholder">
          <h1>{facts.length ? 'All rules reviewed' : 'No rules to review'}</h1>
          <p>
            {facts.length
              ? 'The rules you agreed with are now what the apprentice knows. Deleted rules are gone.'
              : 'Everything the apprentice learned is already agreed.'}
          </p>
          <Link className="button" to={mapPath}>
            Open the Work Map
          </Link>
        </div>
      )}
      {state.status === 'ready' && current && (
        <div className="placeholder rules">
          <p className="rules-count">
            Rule {done + 1} of {facts.length}
          </p>
          <RuleCard key={current.id} fact={current} onDone={() => setDone((n) => n + 1)} />
          <Link className="rules-later" to={mapPath}>
            Review the rest later
          </Link>
        </div>
      )}
    </SessionLayout>
  )
}

interface RuleCardProps {
  fact: Fact
  onDone: () => void
}

function RuleCard({ fact, onDone }: RuleCardProps) {
  const rule = fact.rule ?? fact.question
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [text, setText] = useState(rule)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setSaving(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <section aria-label="Rule">
      {mode === 'edit' ? (
        <label className="rules-edit">
          <span>Say the rule the way it should be taught</span>
          <textarea value={text} rows={3} autoFocus onChange={(e) => setText(e.target.value)} />
        </label>
      ) : (
        <h1 className="rules-rule">{rule}</h1>
      )}

      <ul className="rules-sources" aria-label="Where this rule came from">
        {fact.quotes.map((q, i) => (
          <li key={i}>
            <q>{q.text}</q>
            <span className="rules-meta">
              {q.expert}, session {q.session_id}, {q.date}
            </span>
          </li>
        ))}
      </ul>

      <div className="rules-actions">
        {mode === 'view' && (
          <>
            <button type="button" className="button" disabled={saving} onClick={() => void run(() => agreeRule(fact.id))}>
              Agree
            </button>
            <button type="button" className="button ghost" disabled={saving} onClick={() => setMode('edit')}>
              Edit
            </button>
            <button type="button" className="button ghost" disabled={saving} onClick={() => setMode('delete')}>
              Delete
            </button>
          </>
        )}
        {mode === 'edit' && (
          <>
            <button
              type="button"
              className="button"
              disabled={saving || !text.trim()}
              onClick={() => void run(() => agreeRule(fact.id, text.trim()))}
            >
              Save and agree
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={saving}
              onClick={() => {
                setText(rule)
                setMode('view')
              }}
            >
              Cancel
            </button>
          </>
        )}
        {mode === 'delete' && (
          <>
            <p className="rules-confirm">Delete this rule? The apprentice forgets it and the tutor never teaches it.</p>
            <button type="button" className="button" disabled={saving} onClick={() => void run(() => deleteRule(fact.id))}>
              Delete rule
            </button>
            <button type="button" className="button ghost" disabled={saving} onClick={() => setMode('view')}>
              Keep it
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="rules-meta" role="alert">
          {error}.
        </p>
      )}
    </section>
  )
}
