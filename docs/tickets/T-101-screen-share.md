# T-101 · Screen share + frame capture in the browser
**Lane A · depends on: T-002**

`getDisplayMedia()` on the capture page, with a visible recording indicator and a stop control. Draw the
video to an offscreen canvas at `FRAME_FPS`, encode JPEG at a sane quality/size for the vision model
(cap the long edge around 1280px), and POST to `/ingest/frame` with `session_id` and a monotonic
`frame_ts` in milliseconds from session start.

Do cheap change detection client-side first (downscale + mean absolute difference against the previous
frame) so unchanged frames are dropped before they cost a network round trip — but still record that a
frame existed at that timestamp, because the timeline needs continuous time.

**Acceptance:** a 5-minute session produces ~300 timestamps on the server, of which only the genuinely
changed ones carry image bytes; stopping the share closes the session cleanly.
