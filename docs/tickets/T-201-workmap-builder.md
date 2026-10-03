# T-201 · Work Map builder + gap finder
**Lane B · owner: Hlib · depends on: T-200, T-105**

On **End task**, merge events, transcript and logged answers into a draft Work Map:

1. **Segment** the event stream into steps — a step is a coherent unit of work on one entity, not one
   click. Seven-ish steps for the three-invoice task is the target shape.
2. **Attach** each step's frame moment and, where the expert explained it, the verbatim quote.
3. **Extract guardrails** from quotes containing limits, exceptions and stop-and-ask moments.
4. **Find the gaps** — this is the output the debrief runs on. A gap is a step with a decision but no
   reason, a guardrail with no stated threshold, a branch mentioned but never seen, or an inconsistency
   between two similar events handled differently.

Rank gaps so the debrief asks the three that most change what a new hire could do, not the three that
happen to be first.

**Acceptance:** a recorded session produces a draft map of 5–9 steps and a ranked gap list of at least
five, where a teammate agrees the top three are genuinely the most important unknowns.
