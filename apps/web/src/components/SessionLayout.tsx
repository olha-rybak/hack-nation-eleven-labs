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
  /** False keeps the panel off the page, e.g. before there is a session to show. */
  showPanel?: boolean
  /** Pop the panel into its own window when the expert switches tabs. */
  autoPopOut?: boolean
  children: ReactNode
}

export function SessionLayout({ sessionId, panelTitle, bleed = false, panel, panelSummary, panelActivity, showPanel = true, autoPopOut, children }: Props) {
  return (
    <div className="session-layout">
      <main className={bleed ? 'stage bleed' : 'stage'}>{children}</main>
      {showPanel && (
        <PanelWindow title={panelTitle} summary={panelSummary} activity={panelActivity} autoPopOut={autoPopOut}>
          {panel ?? <SidePanel sessionId={sessionId} title={panelTitle} />}
        </PanelWindow>
      )}
    </div>
  )
}
