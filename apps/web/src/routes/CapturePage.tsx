import { SessionLayout } from '../components/SessionLayout'

export function CapturePage() {
  return (
    <SessionLayout sessionId="demo" panelTitle="Conversation">
      <div className="placeholder">
        <h1>Capture</h1>
        <p>Share the screen where you do the task. The apprentice watches and asks why at natural pauses.</p>
        <button type="button" disabled>
          Share screen
        </button>
        <p className="todo">Screen sharing arrives with T-101.</p>
      </div>
    </SessionLayout>
  )
}
