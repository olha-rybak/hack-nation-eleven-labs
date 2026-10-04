// Where the server is. Locally the Vite proxy serves it at /api. A deployed build sets
// VITE_API_BASE to the server's own URL (it also serves the session WebSocket).
const base = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')

export const api = (path: string) => `${base}${path}`

export function wsUrl(path: string): string {
  const url = new URL(api(path), location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
