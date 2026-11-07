# Morning sheet: recording start (night chain, 2026-11-07)

STEP 0 (quick call start) is on its own branch, `feat/quick-call-start` (871084d, pushed); this
branch, `feat/recording-start`, starts from it. Nothing is merged.

## Done

- **Piece 1 — honest recording state.** "Recording starts…" until the egress reports the
  recording active, then "Recording"; polled every 2 s (`server/src/calls/recordingStart.js`);
  a start that fails or is not active within 60 s is stopped and dropped, and organisers see
  "The recording did not start. Try again."; stop allowed while starting; a restart watches a
  starting recording again. No more `EG_<id>.json` manifests (`disableManifest` on the file
  output). Tests: `server/test/recordingStart.test.js`, `client/src/calls/callRecording.test.jsx`.

## Running

- Piece 2 — "Record from the start".

## Open

- Piece 3 — measuring where the ~20 s go (this PC, egress debug logs, at least 5 starts).

## Needs the owner's word

- **Manifest switch**: egress v1.15.0 has no service-wide option to turn the manifest off; it is
  a field of each request (`pkg/config/manifest.go:85-96`, from the request's file output,
  `pkg/config/output.go:250`). Set there (`server/src/calls/service.js`), not in
  `EGRESS_CONFIG_BODY`. Old `EG_*.json` files stay in the recordings folder.
- **A client outside the call** asks again every 5 s (the page's existing `RETRY_MS`) while a
  recording starts; inside the call the room's metadata says it at once.
