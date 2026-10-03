# T-108 · What to ask — question selection
**Lane C · depends on: T-103, T-109**

Given the event log, the environment brief and the questions already asked, pick the *one* question worth
the interruption. Ranking, highest first:

1. an event that contradicts or isn't covered by the written rules in the environment config
2. a decision with an alternative visibly available — a field changed away from its default
3. a hesitation — a long still screen on a decision field
4. a repeated pattern whose trigger isn't visible

Hard filters: never ask what the glossary or the config already answers; never ask the same subject
twice; at least one question per session must target a **guardrail** (a limit, an exception, a
stop-and-ask moment) — if none has been asked by the fourth opportunity, force one.

Keep the question to one sentence, grounded in something on screen: *"You moved that one to capex — what
made you do that?"*, not *"Can you describe your process?"*

Prompts live in `apps/server/apprentice/prompts/interviewer/`.

**Acceptance:** over three recorded sessions, every question references a concrete on-screen object, and
no question is answerable from `config/environment/`. A teammate reading the questions cold can tell
which one was the guardrail question.
