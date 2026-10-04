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
| [workmap-builder.md](workmap-builder.md) | Session → draft Work Map + ranked gaps; debrief answers, stopping rule, final Work Map; LLM config | T-201, T-203 | draft |
| [environment-pack.md](environment-pack.md) | `config/environment/`: what is documented (and what is deliberately left out), brief + cache | T-109 | draft |
| `question-selection.md` | How the one question is picked from events | T-108 | planned |
| [knowledge-graph.md](knowledge-graph.md) | Facts from expert answers across sessions; the Known slice sent with ASK_NOW; rule review | T-110, T-205 | draft |
| [returns-desk.md](returns-desk.md) | Returns desk sandbox app (`/shop`): expert rules, cases, training case, expert script | scenario | draft |
| [deploy.md](deploy.md) | Hosting: web app on Vercel, server container with a `/data` volume, env vars, demo seed | deploy | draft |

## Open decisions

- Scenario: invoices (tickets, INV-4471–4474) vs credit control (`credit-control-ui/`) vs returns desk
  (`/shop`, [returns-desk.md](returns-desk.md)). Blocks prompts and the environment pack.
