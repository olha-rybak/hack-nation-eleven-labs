// The nav's Work Map, Vault and Teach links follow the session the expert last finished,
// falling back to the recorded demo session. Per browser; storage may be unavailable.
const KEY = 'last-session'
export const DEMO_SESSION = 'demo-brandt'

export function rememberSession(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not remembered: the nav keeps pointing at the demo session.
  }
}

export function lastSession(): string {
  try {
    return localStorage.getItem(KEY) || DEMO_SESSION
  } catch {
    return DEMO_SESSION
  }
}
