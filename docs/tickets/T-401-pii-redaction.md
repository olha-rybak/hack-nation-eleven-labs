# T-401 · PII redaction with Presidio
**Lane B · depends on: T-105**

The second half of question 5: *how is personal data on screen protected?*

Run Microsoft Presidio over transcripts before they are persisted, and over the vision model's event text
— names, emails, IBANs, phone numbers, addresses replaced with typed placeholders (`<PERSON_1>`) that stay
stable within a session so the Work Map still reads coherently.

For frames, redact the detected regions in the stored JPEG rather than storing the original and masking on
display. Gate on `PRESIDIO_ENABLED` so it can be turned off for debugging, and make the capture UI show
when it is off.

Note the honest limitation in the demo rather than overclaiming: frame redaction is best-effort OCR-based,
which is why off-the-record (T-400) exists as the expert's own control.

**Acceptance:** a session where a fake supplier contact name appears on screen produces a Work Map and
transcript containing `<PERSON_1>` and not the name, and the stored frame shows the region masked.
