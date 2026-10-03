# T-301 integration handoff

The presentation layer is implemented. Live acceptance is not complete.
`TutorPresentation.tsx` consumes local UI props, not an agreed wire protocol.
`TeachScenarios.tsx` exercises those props at `/teach/:id?preview=1`; prompts,
resolution and assessment there are explicitly sample data. Never reuse them as
live agent outputs. `TeachWorkspace.tsx` loads the existing Work Map API, renders
real map evidence (or fixture data in VITE_MOCK=1), and reuses the capture hook/view.

## Interfaces needed from owners

- Capture/session owners: a public start operation accepting tutor mode and a
  confirmed source Work Map/session reference. Current ingest.ts hardcodes expert
  role. Tutor server-mode recording is disabled to avoid starting the interviewer.
- T-302: current step identity, connection state, supplied prediction prompt,
  reveal/evaluation state, and a way to send learner reasoning. UI notes currently
  stay local. No automatic step matcher or prediction evaluator exists here.
- T-300/T-302: intervention identity, matched rule/step, expert quote and frame
  timestamp/source session, and an explicit resolution update. Dismissing evidence
  is not resolution. The UI does not block ERP Save.
- T-303: supplied mastered, missed and practice-next items, plus report-ready or
  report-unavailable state. TutorReport is a UI view model; owners must agree a wire
  representation and adapter before integration.

Confirm how source Work Map IDs resolve to session IDs, reconnect/replay ordering,
and how stale predictions/interventions are cleared when a newer step arrives.
Do not connect the interviewer hook to Teach as a substitute for a tutor agent.

## Remaining acceptance checks

1. Live sharing in a supported browser: start, preview, explicit/browser stop,
   denied permission, late chooser after navigation, and failed frame delivery.
2. With agreed interfaces: live alignment, prediction-before-answer, intervention,
   externally confirmed resolution, reconnect and end-of-case assessment.
3. Full case on a second machine; expert frame and quote visible within ~2 seconds
   of the triggering edit. Measure real event-to-render time, not preview switches.

Build/typecheck/lint and presentation-boundary tests must pass. Visual/keyboard
checks should cover state changes, focus, missing evidence/report, mobile and both
color themes. DO_NOT_TOUCH.md remains local-only and must never be published.

## Practice UI completed without owner changes

Manual review now keeps local reasoning notes per step for the current practice.
Restarting clears them; they are not sent or persisted. Reveal, dismissal, step
changes, finish and restart move keyboard focus to the relevant guidance. Expert
frames open in the existing modal FrameViewer, with Escape and Close controls.
The browser's native modal traps focus; the tutor wrapper restores focus to the opener on close.

No new server contracts or agent logic were introduced. Real capture verification
still requires a supported external browser and the agreed tutor session interface
for server mode. Existing mock capture remains available for local testing.
