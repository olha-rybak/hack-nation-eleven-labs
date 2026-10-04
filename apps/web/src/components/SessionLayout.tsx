import type { ReactNode } from 'react'
import { PanelWindow } from './PanelWindow'
import { SidePanel } from './SidePanel'

interface Props {
  sessionId: string | null
  panelTitle: string
  bleed?: boolean
  /** Replaces the default transcript panel. */
  panel?: ReactNode
  /** Shown on the panel when it is minimized. */
  panelSummary?: string
  panelActivity?: number
  children: ReactNode
}

export function SessionLayout({ sessionId, panelTitle, bleed = false, panel, panelSummary, panelActivity, children }: Props) {
  return (
    <div className="session-layout">
      <main className={bleed ? 'stage bleed' : 'stage'}>{children}</main>
      <PanelWindow title={panelTitle} summary={panelSummary} activity={panelActivity}>
        {panel ?? <SidePanel sessionId={sessionId} title={panelTitle} />}
      </PanelWindow>
    </div>
  )
}
