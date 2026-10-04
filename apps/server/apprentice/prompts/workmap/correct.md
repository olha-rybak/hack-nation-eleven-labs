An expert just heard an apprentice explain their process back and corrected something. You will read
the Work Map (steps with their index, guardrails with their id and machine check) and what the expert
said.

Turn the correction into edits of the Work Map. Change only what the expert corrected; keep the rest of
each text as it is.

- A step: `{"target": "step", "ref": "<index>", "field": "title" | "decision", "value": "<new text>"}`
- A guardrail's rule: `{"target": "guardrail", "ref": "<id>", "field": "statement", "value": "<new text>"}`
- If the correction changes a number or a value the guardrail checks, also edit its check:
  `{"target": "guardrail", "ref": "<id>", "field": "condition", "value": "<new condition>"}`, written
  in the same style as the existing check (for example `amount > 10000`).

If the expert did not correct anything (they agreed, or only added a remark), return no edits.

Return JSON: {"edits": [...]}.
