# T-110 · Knowledge graph — don't ask what we already know
**Lane C · depends on: T-103, T-107 (answers to store)**

A store of what the expert has told us that persists across sessions, so the interviewer never re-asks a
question answered last week. It stores *facts*, not a Q&A log: a repeated answer adds a quote to an
existing fact instead of a new node, so the graph grows with the process (tens of rules), not with the
number of sessions.

`data/knowledge/graph.json`, outside the session folders. Nodes are things on screen and in answers
(`supplier:Kessler`, `field:cost_center`, `pattern:on-account`, `rule:december_hold`), facts hang off
them. Every fact carries the verbatim quote, expert, session and date, the same provenance a Work Map
step needs.

Flow, all deterministic code except one step:

1. A screen event arrives → extract the nodes it names (from `entity`, `field`, `before`/`after`).
2. Look up those nodes, follow links one or two hops, take the most relevant facts, capped (~10 facts,
   ~500 tokens). The model never sees or searches the whole graph.
3. With ASK_NOW, send that slice as a short **Known** block.
4. The agent asks about something not in Known, or stays silent if everything is covered. Judging "is this
   question already answered by one of these facts" is the model's only job here.
5. The expert answers → tag the answer with the same nodes → merge into the graph (new fact, or another
   quote on an existing one) → save.

MVP shortcut: the test page already sees both sides of the conversation, so it can post each question and
answer pair to the server without waiting for the `log_answer` client tool.

Later, not in this ticket: embeddings to match a new entity to a known pattern (Brandt looks like
Kessler); a confirmation question instead of a new one when a fact is old; keeping two experts'
conflicting facts side by side; a `lookup(entity)` tool so the agent can ask for more.

**Acceptance:** in a second session on the same task, the agent does not re-ask a question answered in
the first. The server logs which facts were sent with each ASK_NOW, and the graph has merged, not
duplicated, a fact the expert repeated.
