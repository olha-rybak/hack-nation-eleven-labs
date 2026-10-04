import { useMemo } from 'react'
import { useParams } from 'react-router'
import fixture from '../../../server/tests/fixtures/workmap_returns.json'
import type { WorkMap } from '../types/workmap'
import { buildNotes } from '../vault/notes'
import { Vault } from '../vault/Vault'
import '../vault/vault.css'
import { useWorkMap } from '../workmap/useWorkMap'

const demoMap = fixture as WorkMap

export function VaultPage() {
  const { sessionId = '' } = useParams()
  const state = useWorkMap(sessionId)
  const map = state.status === 'ready' ? state.map : state.status === 'loading' ? null : demoMap
  const notes = useMemo(() => (map ? buildNotes(map) : []), [map])

  if (!map) return <p className="placeholder v-loading">Opening the vault…</p>
  return <Vault key={`${sessionId}:${map.id}`} sessionId={sessionId} notes={notes} demo={state.status !== 'ready'} />
}
