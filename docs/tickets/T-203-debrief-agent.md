# T-203 · Debrief — closing the gaps
**Lane C · depends on: T-201, T-107**

A spoken debrief that starts when the expert clicks **End task**. The agent works the ranked gap list
from T-201 and asks the questions it still has — **at least three, none of them answered during the
task**. Each answer writes back into the draft Work Map as a `Quote` with `source: "debrief"`.

Then: *when is it done?* Not a fixed question count. The debrief ends when no unanswered gap remains
above the importance threshold, or the expert declines to go further. Show this live — a small "3 gaps
left" indicator makes the stopping rule visible to the judges, and question 3 of the Apprentice Test asks
exactly how the debrief decides it is done.

Keep it short. The brief's bar is a debrief measured in a few minutes, not a questionnaire.

Prompts in `apps/server/apprentice/prompts/debrief/`.

**Acceptance:** on a recorded session the debrief asks ≥3 questions that provably were not answered
during the task (cross-check against the live transcript), and the gap counter reaches zero.
