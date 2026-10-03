# Build board — AI Apprentice

Owner lanes (from the pipeline diagram):

| Lane | Owner of | Tickets |
|---|---|---|
| **A** | Web app, fake ERP, UI | T-002, T-100, T-101, T-102, T-200, T-202, T-301, T-400 |
| **B** (Hlib) | Local model, backend, data | T-001, T-103, T-104, T-105, T-106, T-201, T-300, T-401 |
| **C** (Olha) | Prompts, ElevenLabs agents, demo | T-107, T-108, T-109, T-110, T-203, T-204, T-302, T-303, T-500, T-501 |

## Order of attack

The brief's own tip: *start with voice and one screen — get screen events into the agent's context
before anything else.* That is the **critical path**: T-001 → T-103 → T-105 → T-107 → T-108 → T-104.
Nothing else in Capture matters until an agent says something out loud that references the screen.

```
Phase 0  setup        T-001  T-002
Phase 1  capture      T-100 T-101 T-102 T-103 T-104 T-105 T-106 T-107 T-108 T-109 T-110
Phase 2  map          T-200 T-201 T-202 T-203 T-204
Phase 3  teach        T-300 T-301 T-302 T-303
Phase 4  trust+demo   T-400 T-401 T-500 T-501
Stretch               T-600 T-601 T-602
```

## Definition of done for the whole build

Three rehearsable demo moments, each mapping to a `Required` box in the brief:

1. **Capture** — during a real task the agent asks ≥3 questions, each at a natural pause and about
   something visible on screen; ≥1 is about a guardrail.
2. **Map** — the debrief asks ≥3 follow-ups not answered during the task and ends with a teach-back the
   expert confirms. Every step and guardrail links to a screen moment and a verbatim quote.
3. **Teach** — a judge playing a new hire processes a case the expert never showed; the tutor catches
   ≥1 wrong decision *before it is saved* and explains it in the expert's reasoning.

## Ticket format

Each file carries: lane, depends-on, the work, and an **Acceptance** block that is a thing you can
observe, not a thing you can claim.
