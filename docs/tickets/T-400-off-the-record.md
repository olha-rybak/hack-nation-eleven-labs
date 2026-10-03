# T-400 · Off the record
**Lane A · depends on: T-105, T-102**

Answers question 5 of the Apprentice Test: *how can the expert take something off the record?*

A button in the side panel and a voice phrase ("off the record") both call
`delete_window(session_id, OFF_THE_RECORD_WINDOW_SEC)`. Frames, events and transcript lines in that
window are deleted from disk, not flagged — and the UI shows them disappearing, because the expert has to
*see* that it worked to trust it.

Also support a pre-emptive pause: capture suspended until resumed, with nothing written at all.

**Note:** the voice path is the `off_the_record()` client tool from T-107, registered in the browser,
calling the same function as the button. The pause mutes the mic and stops the frame sampler, so nothing
reaches the server while it is on.

**Acceptance:** after off-the-record, grepping `data/sessions/<id>/` for text that was on screen during
the window returns nothing, and the frame files for that window are gone.
