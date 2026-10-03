# T-302 · ElevenAgents tutor — teaching voice
**Lane C · depends on: T-300, T-106**

The second agent, same proxy, different role. It has three modes and must pick between them without
being told:

- **Explain** — narrate the step the way the expert did, quoting them.
- **Predict** — ask the new hire what they think happens next *before* they act, so the lesson lands
  before the mistake.
- **Intervene** — on a `stop` from T-300, speak immediately: name what is about to happen, ask them why
  the expert would hesitate, then give the reason in the expert's words and replay the frame.

Never state the rule first in Predict and Intervene. Ask, let them reason, then confirm with the quote —
the brief's bar is *"Sabine would stop here. Why do you think?"*, and a tutor that simply recites the rule
teaches nothing.

The Work Map goes into the agent's knowledge base; guardrail lookups go through MCP tools so the tutor can
cite the exact statement rather than paraphrase it.

Prompts in `apps/server/apprentice/prompts/tutor/`.

**Acceptance:** in a live run the tutor uses all three modes, and every intervention ends with a verbatim
expert quote rather than a paraphrase.
