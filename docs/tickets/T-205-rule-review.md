# T-205 · Rule review — the expert agrees with what we learned
**Lane C · owner: Olha · depends on: T-110, T-204**

Collect every rule learned during sessions (the knowledge graph facts from T-110, plus the steps and
guardrails confirmed in each Work Map) and show them to the expert (the instructor) **one rule at a
time**, after the debrief.

Each rule is written as one plain sentence a person would say, not as a graph fact or a field name:
"If the invoice is over ten thousand, a second person must approve it", not
`invoice.amount > 10000 → requires(second_approval)`. Under the sentence, show where it came from: the
verbatim quote, the session and the date.

For each rule the expert can:

- **Agree** — the rule becomes company knowledge.
- **Edit** — rewrite the sentence; the change lands in the knowledge graph.
- **Delete** — the rule is wrong or not worth keeping; it is removed from the knowledge graph and the
  tutor never teaches it.

A rule the expert has not agreed to is not yet company knowledge.

Open questions:

- Does the tutor (T-302) only teach agreed rules, the way it only loads a confirmed Work Map (T-204)?
- When two sessions disagree, show both side by side and let the expert pick one.
- Besides after each debrief, can the expert open the list later to review it again?
- Should an edit also change the matching step or guardrail in the Work Map? A fact doesn't record
  which step it came from yet.

**Acceptance:** after two sessions, the expert goes through the rules one by one, each shown as a plain
sentence with its quote; they agree with some, edit one and delete one. The edit shows up in the
knowledge graph, and the deleted rule is gone from it.
