# T-602 · Agent-ready guardrails export
**Lane B · stretch · owner: Hlib · depends on: T-300**

Export the confirmed Work Map as instructions an agent can load — a system prompt built from the steps,
the `GuardrailCheck` objects as tool-call preconditions, and an explicit stop list of the moments where
the expert would hand off to a human.

The point to make in the pitch: the artifact that teaches a person and the artifact that constrains an
agent are the same object. People first, then agents.

**Acceptance:** a toy agent loaded with the export processes INV-4471 correctly and *stops* on INV-4474,
citing the guardrail — the same decision the tutor demands of the new hire.
