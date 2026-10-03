# The AI Apprentice

Hack-Nation 7th Global AI Hackathon · Challenge 01 · powered by ElevenLabs

An expert shares their screen and does a real task. A voice agent watches, stays quiet while they work,
and asks *why* at natural pauses. A debrief closes the gaps and ends with a teach-back the expert
confirms. The result is a **Work Map** — a clickable timeline where every step carries the screen moment,
the decision, the expert's own words and the guardrails around it. That Work Map then becomes a voice
tutor that coaches a new hire on their own screen and stops them before they break a rule.

Not a recorder. If a new person could not do the task from what it learned, it is not an AI Apprentice.

## Modules

| | |
|---|---|
| **1 · Capture** | Screen share + ElevenLabs agent that asks why while the expert works |
| **2 · Map** | A spoken debrief that turns the session into a clickable Work Map |
| **3 · Teach** | A voice tutor that coaches a new hire on their own screen |

## How it is wired

One local Nemotron Omni (llama-server, two slots) does all the seeing and thinking: slot 0 turns frame
changes into events, slot 1 writes what the agent says. ElevenLabs handles the voice — Scribe v2 Realtime
for listening, ElevenAgents for speaking — and calls back into our FastAPI server as its custom LLM, so
the agent always knows what is on screen. A pause detector on the server, not the agent, decides when it
is allowed to speak.

Open `Apprentice Pipeline.html` in a browser for the full diagram; the boxes are clickable.

## Getting started

See [CLAUDE.md](CLAUDE.md) for commands and architecture, and [docs/tickets](docs/tickets/README.md) for
the build board. Copy `.env.example` to `.env` first.

## Layout

```
apps/web/            Vite + React + TS — capture UI, Work Map timeline, tutor, fake ERP
apps/server/         FastAPI — vision loop, LLM proxy, session store, Work Map, export
config/environment/  What the model reads about the app before a session starts
docs/tickets/        The build board
```

Challenge brief: `file.pdf`
