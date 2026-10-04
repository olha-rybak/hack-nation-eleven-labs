# Glossary

Field names exactly as they appear on screen.

## Queue (Return requests)

| Field | Meaning |
|---|---|
| Return | Case number, `RMA-` + four digits. |
| Customer | Customer name, with their city underneath. |
| Item | Product name, with the order number underneath. |
| Reason | What the customer selected in the portal (values below). |
| Delivered | Delivery date, with "N days ago" underneath. |
| Price | What the customer paid for the item, in EUR. |
| Status | Open, Escalated or Completed. |

## Case screen

**Order**

| Field | Meaning |
|---|---|
| Order no. | Shop order number, `LH-` + six digits. |
| Item | Product name. |
| SKU | Article number in the catalogue. |
| Price paid | Amount the customer paid for this item, in EUR, VAT included. |
| Delivered | Delivery date, the carrier that delivered it (DHL, DHL Freight, DPD, Hermes, Deutsche Post), how many days ago, and the return window. |
| Item opened | Yes / No, as stated by the customer. |
| Packaging | Condition of the packaging as described by the customer, sometimes with a photo attached. |

**Request**

| Field | Values |
|---|---|
| Reason | **Defective** (stopped working or never worked), **Arrived damaged** (broken on arrival), **Changed my mind**, **Does not fit**, **Wrong item** (we shipped a different article). |
| Customer message | Free text the customer wrote in the portal. |

**Customer**

| Field | Meaning |
|---|---|
| Name, email | Contact details. |
| City | Delivery city. |
| Customer since | Date of the first order. |
| Orders (12 months) | Number of orders in the last 12 months. |
| Returns (12 months) | Number of return requests in the last 12 months. |

**Decision**

| Field | Values / meaning |
|---|---|
| Resolution | **Refund** (money back to the original payment method), **Replacement** (the same article is shipped again), **Carrier claim** (a damage claim is filed with the shipping carrier), **Goodwill refund** (refund granted outside the normal return policy), **Reject** (the return is declined). |
| Refund amount (EUR) | Only for Refund and Goodwill refund. Pre-filled with the price paid when the restocking fee is ticked or unticked. |
| Restocking fee | Checkbox: 15 % of the price is deducted from the refund. |
| Note | Free text, internal. |

**Actions**

| Button | Effect |
|---|---|
| Save | Stores the decision without closing the case. |
| Escalate to supervisor | Opens the escalation dialog. Reasons: Refund over 200 EUR, Possible abuse, Carrier dispute, Customer complaint, Other. The case becomes Escalated and leaves the queue. |
| Complete | Executes the resolution and closes the case (status Completed). |

**History**: every change with time and user.
