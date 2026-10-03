# Knowledge graph (T-110)

What the expert has told us, kept across sessions so the interviewer doesn't re-ask it. Code:
`apps/server/apprentice/knowledge/`. Tests: `apps/server/tests/test_knowledge.py`.

## Storage

`KNOWLEDGE_PATH` (default `data/knowledge/graph.json`, gitignored), outside the session folders.

```json
{"facts": [{
  "id": "f3e1c0a9b2d",
  "nodes": ["field:cost_center", "supplier:kessler", "value:0400", "value:4711"],
  "question": "Why did you change the cost center to 0400?",
  "quotes": [{"text": "Over 5,000 it's capex, so 0400.", "expert": "Anna", "session_id": "s1",
              "date": "2026-10-04", "event_id": "e1", "frame_ref": "frames/0000002000.jpg"}]
}]}
```

## Nodes

Taken from the event the question was about, by code, no model:

- `supplier:` / `company:` from the entity if it names one (`supplier Nordtec GmbH`), otherwise from
  the visible fields of that entity's last `open` event (`Supplier`, `Vendor`, `Company`,
  `Company code`). The invoice itself is never a node: its number doesn't come back next session.
- `field:` from `field`, `value:` from `before` and `after`.

A fact is keyed by its node set. An answer tagged with the same nodes as an existing fact adds a
quote to it; the question stays the first one asked.

## Known slice

When `ask_now` fires, the server takes the subject event's nodes and sends `known` with it (see
[api.md](api.md)):

1. One hop: facts sharing a node, most shared nodes first.
2. Two hops: facts sharing a node with a one-hop fact.
3. Cut at `KNOWN_MAX_FACTS` or `KNOWN_MAX_CHARS`, whichever comes first.

Each line is `<question> "<latest quote>" (<expert>, <date>)`. The same list is written to the
session's pause log with the `ask_now`, so you can see which facts were sent. Deciding whether a fact
already answers a question is the agent's job (`prompts/interviewer/system.md`).

## API

- `POST /knowledge/answers` body `{"session_id", "event_id", "question", "answer", "expert"?}` →
  the fact it created or added a quote to. 404 for an unknown session or event.
- `GET /knowledge` → `{"facts": [...]}`.

## Not done yet

- Nothing in the browser consumes `ask_now` yet (T-104), so `known` doesn't reach the agent, and
  nothing posts question/answer pairs to `/knowledge/answers`.
- Off the record doesn't remove facts that came from the deleted window.
- Matching a new supplier to a known pattern, confirmation questions for old facts, conflicting
  experts, a `lookup` tool: later, see the ticket.
