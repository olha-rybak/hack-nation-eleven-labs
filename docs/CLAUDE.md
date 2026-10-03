# docs/CLAUDE.md — component index

Entry point for component documentation. This file only points to other docs; details live in the
linked files, one per component.

## Rules for this file

- Keep it under 200 lines. If a section grows, move it into its own `docs/<component>.md` and link it.
- One line per component: link + what it covers + ticket(s).
- When a component doc is added, renamed or removed, update the index below in the same change.

## Components

Status: `planned` = not written yet, `draft` = exists, may change, `stable` = others build on it.

| Doc | Covers | Tickets | Status |
|---|---|---|---|
| [tickets/README.md](tickets/README.md) | Build board, lanes, order of attack | all | stable |
| [api.md](api.md) | Backend API: sessions, `/ingest/frame`, event contract, websocket, `ask_now`, `/events` | T-101, T-103, T-104, T-105 | draft |
| [interviewer-agent.md](interviewer-agent.md) | Interviewer: prompts, events → ElevenLabs agent (built-in Claude), test page, setup | T-106, T-107 | draft |
| [workmap-builder.md](workmap-builder.md) | Session → draft Work Map + ranked gaps for the debrief; verbatim quotes; LLM config | T-201 | draft |
| `environment-pack.md` | Glossary, written rules, task: what the agent must not ask | T-109 | planned |
| `question-selection.md` | How the one question is picked from events | T-108 | planned |

## Open decisions

- Scenario: invoices (tickets, INV-4471–4474) vs credit control (`credit-control-ui/`). Blocks prompts
  and the environment pack.
