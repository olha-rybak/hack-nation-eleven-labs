import type { ReactNode } from 'react'
import { SidePanel } from './SidePanel'

interface Props {
  sessionId: string | null
  panelTitle: string
  bleed?: boolean
  /** Replaces the default transcript panel. */
  panel?: ReactNode
  children: ReactNode
}

export function SessionLayout({ sessionId, panelTitle, bleed = false, panel, children }: Props) {
  return (
    <div className="session-layout">
      <main className={bleed ? 'stage bleed' : 'stage'}>{children}</main>
      {panel ?? <SidePanel sessionId={sessionId} title={panelTitle} />}
    </div>
  )
}
