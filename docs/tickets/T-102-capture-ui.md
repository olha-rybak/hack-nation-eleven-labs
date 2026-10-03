# T-102 · Capture UI — side panel
**Lane A · depends on: T-002, T-105**

The side panel next to the shared screen: live event feed (what the apprentice thinks it saw), the
agent's spoken turns and the expert's replies as they are transcribed, a question-budget indicator
(`2 of 5 asked`), an **Off the record** button and an **End task** button.

The event feed is the trust surface — the expert can see exactly what is being recorded about them, and
correcting a wrong event inline should be possible (edits write back to the session log).

**Acceptance:** during a live session the feed updates within ~2s of an on-screen change; **End task**
transitions to the debrief; **Off the record** visibly removes the last 30 seconds from the feed.
