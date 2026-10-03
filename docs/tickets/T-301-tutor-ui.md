# T-301 · Tutor UI — coaching overlay
**Lane A · depends on: T-102, T-200**

`/teach/:workMapId`. The new hire shares their own screen and works a case; the same capture loop runs,
with the Work Map loaded. The overlay shows the current step from the map, what the expert did here, and
— when the tutor intervenes — the expert's frame replayed side by side with the new hire's screen.

That replay is the payoff of every `frame_ts` in the schema: *"Sabine would stop here. Why do you think?"*
followed by her actual screen moment.

Reuse the capture components rather than forking them; the only differences are the loaded Work Map, the
guardrail checks and who is being asked the questions.

**Note:** the brief also asks the tutor to have the new hire *predict the next decision*. When a case
opens, the overlay shows the prompt (T-302 decides the wording) without the answer. The end-of-case report
from T-303 renders in this overlay.

**Acceptance:** the tutor page runs a full case on a second machine, and an intervention displays the
expert's frame and quote within ~2s of the triggering edit.
