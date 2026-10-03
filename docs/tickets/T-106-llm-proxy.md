# T-106 · ElevenLabs custom-LLM proxy
**Lane B · owner: Olha · depends on: T-001, T-105**

`POST /agent/llm` — an OpenAI chat-completions-shaped endpoint (streaming) that ElevenAgents is pointed
at as its custom LLM. On each call: resolve the session from the request, inject the environment brief,
the recent event log and the questions already asked, then forward to slot 1 and stream the reply back.

Authenticate with `AGENT_PROXY_TOKEN`. The endpoint must be reachable by ElevenLabs, so expect to run it
behind a tunnel during the hackathon — write the exact tunnel command into this ticket's notes once you
find one that works, because everyone will need it.

Both the interviewer and the tutor use this endpoint; the role comes from the session record, not from
two separate code paths.

**Acceptance:** an ElevenAgents conversation configured against the proxy produces a reply that
references something only visible in the event log — e.g. it names the invoice number on screen.
