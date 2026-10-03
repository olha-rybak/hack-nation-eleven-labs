import type { ReactNode } from 'react'
import { SidePanel } from './SidePanel'

interface Props {
  sessionId: string
  panelTitle: string
  children: ReactNode
}

export function SessionLayout({ sessionId, panelTitle, children }: Props) {
  return (
    <div className="session-layout">
      <main className="stage">{children}</main>
      <SidePanel sessionId={sessionId} title={panelTitle} />
    </div>
  )
}
