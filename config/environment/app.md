# Returns Desk — Lumen Home & Tech

Lumen Home & Tech is an online shop for electronics, kitchen appliances, home goods and sportswear,
shipping across Germany. The **Returns Desk** is the customer-service back office where agents work
the return requests customers submit through the customer portal.

Every request is one return case, numbered `RMA-` plus four digits (for example RMA-1041). An agent
opens a case, reads the order and the customer's message, chooses a resolution and either completes
the case or escalates it to a supervisor.

## Screens

- **Return requests** (start screen): the queue. One row per case with return number, customer and
  city, item and order number, reason, delivery date, price and status. Tabs: *To process* (open
  cases) and *All*. Clicking a row opens the case.
- **Return RMA-xxxx** (case screen): the order, the request, the customer and the case history on
  the left and right; the **Decision** panel on the right with the resolution, refund amount,
  restocking fee, note and the buttons **Save**, **Escalate to supervisor** and **Complete**.
- **Escalate RMA-xxxx** (dialog): opened from the case screen; asks for an escalation reason and a
  note for the supervisor.

The status line at the bottom of every screen confirms the last action, for example
"RMA-1041 completed: Replacement".

The header shows the system date and the logged-in agent. **Reset sandbox** restores the demo data.
