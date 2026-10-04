# Returns desk — demo scenario

A second sandbox app next to the ERP: the customer-service returns desk of an online shop,
**Lumen Home & Tech**. Open `/shop` (expert cases) or `/shop?case=training` (the new hire's cases).
Tab title for the share dialog: *Lumen Returns Desk*. **Reset sandbox** in the header restores the seed.

The rules below are what the expert knows and the app does not say. They live in the expert's head
and in `apps/web/src/shop/data.ts` comments, never in UI text.

## The expert's rules

| Kind | Rule |
|---|---|
| Limit | Return window is 30 days from delivery. |
| Limit | Any refund over 200 EUR needs a supervisor: **Escalate to supervisor**, don't complete it yourself. |
| Rule | Opened electronics returned for "changed my mind" get the 15 % restocking fee. Defects never do. |
| Guardrail | Damaged in transit (crushed or dented box) → **Carrier claim**, never a refund from our own pocket. The carrier pays. |
| Guardrail | More than half of the last 12 months' orders returned → don't refund, escalate as *Possible abuse*. |
| Judgment | A loyal customer (years, many orders, no returns) a few days outside the window with a small amount gets a **Goodwill refund**. |
| Judgment | A plain defect inside the window → **Replacement** first; refund only if the customer insists. |

## Expert cases (`/shop`)

| Case | What's going on | Expert decision |
|---|---|---|
| RMA-1041 | Headphones 89 EUR, one ear died after a week | Replacement |
| RMA-1042 | TV 649 EUR, screen cracked, box crushed | Carrier claim, escalate (over 200 EUR) |
| RMA-1043 | Espresso machine 329 EUR, opened, "too loud" | Refund with restocking fee (279.65), escalate (over 200 EUR) |
| RMA-1044 | Shoes 120 EUR, 9 returns out of 10 orders | Escalate: possible abuse |
| RMA-1045 | Kettle 45 EUR, day 34, customer since 2017, 41 orders, 0 returns | Goodwill refund |

Good live questions the apprentice should get to: *why a carrier claim and not a refund?* (guardrail),
*why the fee on the espresso machine but not the headphones?*, *why refund the kettle when it's outside
the window?* (judgment), *what makes a customer an abuser?* (limit).

## Training case (`/shop?case=training`)

| Case | Trap | Tutor catches |
|---|---|---|
| RMA-2051 | Soundbar 279 EUR, box dented, rattling, unopened | New hire picks **Refund**. Tutor: "The expert would stop here. Why?" → carrier claim, plus escalate (over 200 EUR) |
| RMA-2052 | Phone case 19 EUR, wrong model shipped | Easy: Replacement (warm-up) |

## Expert script (5–7 minutes)

Work top to bottom, talk while you do it, keep it natural:

1. RMA-1041: "Defect, inside the window, normal customer: replacement." Complete.
2. RMA-1042: notice the crushed box. Pick **Carrier claim**, note "DHL Freight, photo attached",
   **Escalate** (Refund over 200 EUR / Carrier dispute).
3. RMA-1043: **Refund**, tick the restocking fee, **Escalate** (over 200 EUR).
4. RMA-1044: look at Returns (12 months) = 9. **Escalate** as Possible abuse.
5. RMA-1045: day 34, but since 2017 with 41 orders. **Goodwill refund** 45.00. Complete.
