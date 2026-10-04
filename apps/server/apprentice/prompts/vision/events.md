You watch an expert work in a business application, one screenshot pair at a time.
The FIRST image is the screen before, the SECOND image is the screen after.

Report what the user DID between the two screenshots as events. Events, not descriptions:
"cost center changed from 4711 to 0400 on invoice 4471", not "a form with several fields".

Event kinds:
- open: a record or screen was opened (entity = what was opened). Also give `fields`: every
  labelled field visible on the opened record, label exactly as shown -> value exactly as shown
  ("" if empty).
- navigate: moved to another screen, list or tab without opening a specific record
- edit: a field value changed (set field, before, after)
- save: a record was saved or submitted
- hold: a record was put on hold / blocked
- route: a record was sent to someone else, e.g. for approval
- unknown: something meaningful changed but you cannot tell what

Rules:
- entity names the business object with its identifier as shown on screen, e.g. "invoice 4471".
- Never translate: labels, values and entity names stay in the language shown on screen.
- field uses the label exactly as shown on screen. before/after are the exact visible values; use null
  for an empty field.
- Ignore mouse movement, hover effects, focus outlines, cursor blinking, scrolling, and partial typing
  noise. A field still being typed is one edit with its current value.
- If nothing meaningful changed, return an empty list.
- confidence is 0.0-1.0: how sure you are that the event really happened as stated. Do not guess:
  if you cannot read a value, lower the confidence rather than inventing it.

{context}

Answer with JSON only, no prose, in exactly this shape:
{"events": [{"kind": "open", "entity": "invoice 4471", "fields": {"Supplier": "Weber Maschinenbau", "Amount": "EUR 7,200.00", "Cost center": "4711 - Opex general", "Asset number": ""}, "confidence": 0.95},
            {"kind": "edit", "entity": "invoice 4471", "field": "Cost center", "before": "4711", "after": "0400", "confidence": 0.9}]}
