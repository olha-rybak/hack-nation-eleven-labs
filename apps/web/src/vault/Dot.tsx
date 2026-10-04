import { kindColorVar } from './graphEngine'
import type { Note } from './notes'

export function Dot({ kind }: { kind: Note['kind'] }) {
  return <i className="v-dot" style={{ background: `var(${kindColorVar[kind]})` }} />
}
