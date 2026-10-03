import type { ScreenEvent } from '../types/session'

/** One plain line for what the apprentice saw, e.g. "INV-4471: cost center 4711 → 0400". */
export function describeEvent(e: ScreenEvent): string {
  const change = e.before || e.after ? ` ${e.before ?? '—'} → ${e.after ?? '—'}` : ''
  switch (e.kind) {
    case 'open':
      return `Opened ${e.entity}`
    case 'navigate':
      return `Went to ${e.entity}`
    case 'save':
      return `Saved ${e.entity}`
    case 'hold':
      return `Put ${e.entity} on hold`
    case 'route':
      return `Sent ${e.entity}${e.after ? ` to ${e.after}` : ' for approval'}`
    case 'edit':
      return `${e.entity}: ${e.field ?? 'value'}${change}`
    default:
      return `${e.entity}${e.field ? ` · ${e.field}` : ''}${change}`
  }
}

export const LOW_CONFIDENCE = 0.75
