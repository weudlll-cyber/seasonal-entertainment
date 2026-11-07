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

- **Piece 3 — where the ~20 s go** (measurement only, nothing changed; below).

## Running

- Nothing.

## Open

- A measurement on the VPS itself (see "Needs the owner's word").

## Piece 3: the measurement

**Setup** (this PC, 2026-11-07, then removed again): the pinned images on their own Docker
network — LiveKit v1.13.10, egress v1.15.0 (3 CPUs, 3 GB, room composite cost 2.0, as
`deploy/calls/docker-compose.recording.yml`), Redis 7.4.11 — and one publisher per start
(`lk room join`, livekit-cli 2.19.3): the CLI's demo video ("video") or a 440 Hz Opus tone
("audio", like a speaker with a microphone only). Each start used the site's own encoding and
layout (`server/src/calls/service.js`), with the publisher's track already in the room. Egress
at debug level for the run only. Times are seconds after the start request; egress's own log
lines, and LiveKit's for the egress's participant (Chrome's console log, `chrome.log`, is deleted
with each recording's temporary folder, so "room connected" and "first track" are LiveKit's view).

**Docker Desktop and CPU**: egress counted 3 CPUs here (its startup line `available: 3`), so its
own CPU check saw the same limit as on the VPS; whether Docker Desktop throttles Chrome the way
the VPS's cgroup did (live maxCPU 2.75 of 3) is not known (the 2026-10-22 note). The numbers below
are from an idle egress on a busy PC.

| Step (s after the request) | video, N=5 median (min–max) | audio, N=5 median (min–max) |
| -------------------------- | --------------------------- | --------------------------- |
| request received (egress)  | 0.55 (0.53–0.59)            | 0.54 (0.53–0.55)            |
| Chrome launching           | 0.66 (0.61–0.75)            | 0.61 (0.59–0.62)            |
| Chrome page loaded         | 2.72 (2.53–3.00)            | 2.27 (2.12–2.32)            |
| room connected (LiveKit)   | 3.66 (3.44–4.33)            | 3.15 (2.96–3.25)            |
| first track sent (LiveKit) | 3.67 (3.45–4.35)            | not logged for audio, N=0   |
| waiting for start signal   | 3.55 (3.28–4.12)            | 3.02 (2.86–3.13)            |
| START_RECORDING            | 4.22 (4.02–6.05)            | 3.50 (3.34–3.60)            |
| pipeline playing           | 7.02 (6.97–8.50)            | 6.94 (6.93–6.96)            |
| egress_active              | 7.03 (6.97–8.51)            | 6.95 (6.94–6.97)            |

- **Cold egress**: the first three starts after the egress container started (video, N=3): two
  failed after 20.6 s ("page load error: websocket url timeout reached", Chrome never answered),
  one reached active after 17.2 s. Every start after them (N=10) was active in 7.0–8.5 s. The
  live start of 2026-11-06 came right after the update had recreated egress: 20.3 s to
  START_RECORDING, as cold here.
- **What the template waits for** before START_RECORDING (egress v1.15.0
  `template-default/src/Room.tsx:66-110`, polled every 100 ms): decoded frames of a video track;
  or, with no video track, a subscribed track for 500 ms; or 5 s (`FRAME_DECODE_TIMEOUT`,
  `Room.tsx:31`) with any subscribed track. Here: about 0.5 s after the room connect for audio,
  0.6–2.0 s for video.
- **START_RECORDING to playing**: a nearly fixed 3.4 s for audio (2.4–3.0 s for video): egress's
  pipeline latency, default 3 s (`pkg/config/service.go:52`), the size of its audio queues
  (`pkg/pipeline/builder/audio.go:83`, `:457`). Set to 1 s for three audio starts (N=3), every
  one failed: "Impossible to configure latency: max 0:00:01 < min 0:00:02.333…"; egress warns
  that changing it "may break the service" (`pkg/config/base.go:68`).
- **Egress's log level**: v1.15.0 reads `logging: level:` (`pkg/config/base.go:43`); the
  `log_level: info` in `deploy/calls/docker-compose.recording.yml` is not a key it knows (info
  is its default anyway, so nothing changes today).

**Speed-up proposals** (none built):

1. **Warm the egress after it starts** (expected: the first recording after an update or a
   restart active in about 7 s instead of 17–20 s or failing). Evidence: cold N=3 (two failed at
   20.6 s, one 17.2 s) against warm N=10 (7.0–8.5 s); the live 20.3 s came right after egress
   was recreated. For example: the installer, after starting egress, starts and stops one
   recording of a throw-away room once, so Chrome has started there before anyone records.
2. **Measure once on the VPS** with `logging: level: debug` before anything else (expected: no
   gain by itself, but it tells whether the VPS is cold-start-bound like this PC or slow on every
   start, e.g. Chrome starved at 2.75 of 3 CPUs). Evidence: this PC's warm starts are 7 s, live
   was 22.6 s to playing; only the VPS can say which step takes the rest.
3. **Pipeline latency a little lower, e.g. 2.5 s** (expected: at most about 0.5 s; egress's own
   minimum here was 2.33 s). Evidence: the fixed 3.4 s gap above, and 1 s failing every start
   (N=3). Small gain against egress's own warning; not recommended before 1 and 2.

## Needs the owner's word

- **Piece 3's proposals** (below): whether to warm the egress after it starts (1), and a debug
  measurement on the VPS first (2). Nothing of them is built.
- **`log_level: info`** in `deploy/calls/docker-compose.recording.yml` is not a key egress
  v1.15.0 knows (`logging: level:` is); left as it is, since info is the default.

- **A waiting recording holds the egress**: started with the call, it keeps Chrome running and
  egress's 2.0-CPU reservation until someone speaks, so a button recording in another call
  meanwhile is declined ("did not answer" / "did not start").

- **Manifest switch**: egress v1.15.0 has no service-wide option to turn the manifest off; it is
  a field of each request (`pkg/config/manifest.go:85-96`, from the request's file output,
  `pkg/config/output.go:250`). Set there (`server/src/calls/service.js`), not in
  `EGRESS_CONFIG_BODY`. Old `EG_*.json` files stay in the recordings folder.
- **A client outside the call** asks again every 5 s (the page's existing `RETRY_MS`) while a
  recording starts; inside the call the room's metadata says it at once.
