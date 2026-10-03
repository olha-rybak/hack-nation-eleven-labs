import type { ReactNode } from 'react'
import { SidePanel } from './SidePanel'

interface Props {
  sessionId: string
  panelTitle: string
  bleed?: boolean
  children: ReactNode
}

export function SessionLayout({ sessionId, panelTitle, bleed = false, children }: Props) {
  return (
    <div className="session-layout">
      <main className={bleed ? 'stage bleed' : 'stage'}>{children}</main>
      <SidePanel sessionId={sessionId} title={panelTitle} />
    </div>
  )
}
