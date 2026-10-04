# Environment pack (T-109)

`config/environment/` is what the company has written down about the app the expert works in. The
apprentice reads it once at session start and turns it into an **environment brief** that stays in
its context, so it names fields correctly and never spends a question on something documented.

Current pack: the returns desk (`/shop`, see [returns-desk.md](returns-desk.md)).

| File | Content |
|---|---|
| `app.md` | What the app is, its screens, what the status line shows |
| `glossary.md` | Every field by its on-screen name, with the values it can take and what each button does |
| `rules.md` | The written returns policy, deliberately short |
| `task.md` | Today's task: work RMA-1041 to RMA-1045 |
| `screens/*.png` + `*.md` | Screenshots of the queue and a case, each with a caption file (only the captions go into the brief) |

## What is deliberately not in the pack

The pack only holds what a real handbook would have. The expert's unwritten rules are what the
apprentice is there to learn, so they must stay out of every file here:

- damaged in transit is a **carrier claim**, never a refund or replacement from our own pocket
- the supervisor limit applies to **any return** over 200 EUR, not only refunds (the handbook says
  "refunds above 200 EUR", so the gap itself is worth a question)
- a customer who returns most of their orders is escalated as **possible abuse**
- a loyal customer a few days outside the window gets a **goodwill refund**
- a plain defect gets a **replacement first**

If one of these lands in `rules.md`, the agent will stop asking about it and the demo loses its best
questions.

## How it is used

- At startup the server loads the pack, hashes it and builds the brief with the Work Map LLM
  (`MAP_LLM_PROVIDER`). The brief is cached in `data/environment/brief-<hash>.md`, so it is only
  rebuilt when a file changes. Without an LLM the raw pack text is used instead.
- The vision prompt gets the brief as "About this application".
- The capture page sends it to the ElevenLabs agent as background context right after connecting
  (`GET /environment/brief`).
