# T-601 · Any language — German expert, English tutor
**Lane C · stretch · depends on: T-204, T-302**

A brief stretch goal, and a cheap one given the architecture: Scribe handles German input, the Work Map
stores the quote in the original language plus a translation, and the tutor agent uses an English voice.

The rule that makes it honest: the **quote is never translated away**. Store `Quote.text` verbatim in the
expert's language with `Quote.text_en` alongside. The expert's own words are the provenance; a translation
is a convenience layer over them.

Fits the story directly — Sabine is near Stuttgart.

**Acceptance:** a German-language capture session produces an English teach-back and an English tutor run,
with the German quotes visible in the timeline.
