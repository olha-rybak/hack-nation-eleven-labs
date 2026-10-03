# T-202 · Work Map timeline UI
**Lane A · depends on: T-200**

`/map/:sessionId` — the clickable timeline. Each step shows, in this order of visual weight: the title,
the screen moment (the actual frame, clickable to enlarge), the decision, the reason as a pull-quote in
the expert's words with its timestamp, and the guardrails attached to it.

Judgment calls and guardrails are visually distinct from routine steps — the headline number the brief
describes is *"seven steps, three judgment calls and four guardrails"*, so make that count readable at a
glance at the top.

Clicking a quote's timestamp jumps to that frame. Clicking a guardrail highlights every step it governs.

**Acceptance:** a judge who did not watch the session can read the timeline and correctly state the three
rules the expert applied, with the screen moment for each.
