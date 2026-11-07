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

- **Piece 2 — "Record from the start".** A checkbox in the "New call" form (off by default, shown
  only while recording is set up and allowed), stored per call. Starting the call starts its
  recording at once (the egress's template waits for media, egress v1.15.0
  `template-default/src/Room.tsx:66-110`), state "waiting" ("Recording starts when someone
  speaks…"), no 60 s rule; the room closing or the call ending first drops it without a message;
  a recording that cannot start leaves the call running with the organisers' message. Tests:
  `server/test/recordingStart.test.js`, `client/src/calls/quickStart.test.jsx`,
  `client/src/calls/callRecording.test.jsx`.

## Running

- Piece 3 — measuring where the ~20 s go.

## Open

- Nothing beyond Piece 3.

## Needs the owner's word

- **A waiting recording holds the egress**: started with the call, it keeps Chrome running and
  egress's 2.0-CPU reservation until someone speaks, so a button recording in another call
  meanwhile is declined ("did not answer" / "did not start").

- **Manifest switch**: egress v1.15.0 has no service-wide option to turn the manifest off; it is
  a field of each request (`pkg/config/manifest.go:85-96`, from the request's file output,
  `pkg/config/output.go:250`). Set there (`server/src/calls/service.js`), not in
  `EGRESS_CONFIG_BODY`. Old `EG_*.json` files stay in the recordings folder.
- **A client outside the call** asks again every 5 s (the page's existing `RETRY_MS`) while a
  recording starts; inside the call the room's metadata says it at once.
