# T-109 · Environment config pack + priming brief
**Lane C · owner: Olha · depends on: T-001**

Fill `config/environment/` for the fake ERP: `app.md` (what it is, the screens), `glossary.md` (every
field, with the values it can take), `rules.md` (only what a real company would actually have written
down — deliberately incomplete), `screens/` (captioned screenshots), `task.md` (today's task).

At session start the model reads the pack once and writes an **environment brief** that stays in context
for the whole session. Cache it per config hash so a session start isn't a cold read every time.

The point of this ticket is negative: it makes the agent *stop asking* about things that are documented,
so its small question budget is spent only on what lives in the expert's head.

**Acceptance:** with the pack loaded, the agent names fields by their real names and asks zero questions
answerable from `glossary.md` or `rules.md`; removing the pack visibly degrades both.
