# T-203 · Debrief — closing the gaps
**Lane C · owner: Olha · depends on: T-201, T-107**

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

## Steps

Each step is one small PR that works on its own. 1–3 are server only and can be tested without voice.

1. **End task builds the draft.** `CapturePage.tsx` End task calls `POST /sessions/:id/workmap/draft`
   after stopping capture, then opens the debrief instead of `/map/:id`. Show a "Preparing your
   debrief…" state while it builds (~10 s) and a retry on 502.
   *Done when:* End task on a recorded session leaves `workmap_draft.json` in the session folder.

2. **Gap status and answers.** Add `status: open | answered | declined` to `Gap`, and
   `POST /sessions/:id/debrief/answer {gap_id, text, ts_ms}`. The answer becomes a
   `Quote(source="debrief")` on the gap's step or guardrail `reason`, the gap is marked answered, and
   the draft is saved. `{gap_id, declined: true}` marks it declined. Answers also go to the knowledge
   graph (T-110), like live answers do.
   *Done when:* answering every gap for a step makes `to_workmap()` stop complaining about that step.

3. **Skip what earlier sessions already answered.** Before ranking, look up each gap's nodes in the
   knowledge graph (`nodes_for_event` on the step's events). A gap fully covered by a Known fact is
   filled from that fact's quote instead of asked. Log which gaps were skipped and why.
   *Done when:* in a second session on the same task, a rule explained in the first is not asked.

4. **Stopping rule and gap counter.** The debrief is done when no open gap has importance at or above
   `DEBRIEF_MIN_IMPORTANCE` (default 3), or the expert says to stop. Then `to_workmap()` and save
   `workmap.json`, so `/map/:id` shows it. `GET /sessions/:id/debrief` returns the next gap and
   "N gaps left". If the live session had no guardrail question (T-108), the first debrief question
   must be one.
   *Done when:* the counter reaches zero and the map page loads the Work Map.

5. **Debrief prompt.** `apps/server/apprentice/prompts/debrief/system.md`: one question at a time,
   the gap's question as written, a short acknowledgement, no summarizing (that is T-204). The cue is
   `NEXT_GAP` followed by `Gap:`, `Why:` and the frame it is about.
   *Done when:* a teammate reading three asked questions cold can tell what each was about.

6. **Debrief voice loop.** A debrief screen (or the capture panel in debrief mode) reusing
   `useInterviewer`'s pattern with the same ElevenLabs agent and the debrief prompt as an override:
   cue the next gap, pair the agent's question with the expert's reply (`AnswerPairer`), post the
   answer (step 2), cue the next one. Show the frame each question is about and the "3 gaps left"
   counter. A "Stop here" button declines the rest.
   *Done when:* the acceptance below passes in a live call.

7. **Hand over to the teach-back (T-204).** When the debrief ends, the screen moves to the
   teach-back step, or to the Work Map until T-204 exists.
