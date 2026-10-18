# CALLS.md — community calls

Community calls (decided 2026-10-18): a stage with up to 10 speakers and 100–200 listeners.
Video only for speakers, never for listeners; presenting is screen sharing, with system audio
where the browser allows. The call service is **LiveKit** (open source, Apache-2.0,
self-hosted). For now it runs on the same VPS as the site; moving it to its own VPS is a
configuration change only (below).

## Configuration

The site reads three environment keys (`server/src/calls/config.js`, listed in `.env.example`):

| Variable           | Example                   | Meaning                                              |
| ------------------ | ------------------------- | ---------------------------------------------------- |
| `CALLS_URL`        | `wss://calls.example.org` | the call service's public WebSocket origin (no path) |
| `CALLS_API_KEY`    | `APIxxxxxxxx`             | LiveKit API key                                      |
| `CALLS_API_SECRET` | (32+ characters)          | LiveKit API secret                                   |

- **None set**: the Calls feature is off. Admins see it as "not configured"; everyone else does
  not see it at all.
- **Some but not all set**, or a URL that is not a `ws://`/`wss://` origin: the server refuses
  to start.
- **Production** (`NODE_ENV=production`) also refuses `ws://`, LiveKit's development pair
  (`devkey` / `secret`) and secrets shorter than 32 characters.

Generate a production pair on the call server with
`docker run --rm livekit/livekit-server:v1.13.10 generate-keys`.

## The call service (`deploy/calls/`)

- `livekit.yaml` — LiveKit's configuration, no secrets: ports, the UDP range, TURN, room
  defaults.
- `docker-compose.yml` — only the LiveKit service, pinned to v1.13.10 by tag and image digest;
  host networking (WebRTC needs the real ports and address).
- `.env.example` — what `deploy/calls/.env` (never committed) holds: `LIVEKIT_KEYS`
  (`"<key>: <secret>"`, the same pair as the site's `CALLS_API_KEY` / `CALLS_API_SECRET`),
  `CALLS_DOMAIN` (TURN), `CALLS_CERT_DIR` (the domain's certificate).

**Resource limits** (decided 2026-10-18): 2 CPUs and 2 GB of memory, in `docker-compose.yml`
under `deploy.resources.limits`. To change them, edit `cpus` and `memory` there and run
`docker compose up -d` again. As a rough guide, one CPU forwards audio for a few hundred
listeners; video and screen sharing cost more — watch `docker stats` during a real call before
raising or lowering.

### Ports and firewall

| Port        | Protocol | Open to  | What                                                         |
| ----------- | -------- | -------- | ------------------------------------------------------------ |
| 443         | TCP      | everyone | the reverse proxy: `wss://<calls domain>` → `127.0.0.1:7880` |
| 7880        | TCP      | nobody   | signalling and API; only the reverse proxy reaches it        |
| 7881        | TCP      | everyone | media over TCP (ICE), for clients whose UDP is blocked       |
| 50000–50499 | UDP      | everyone | media (500 ports: 250 participants × 2 peer connections)     |
| 3478        | UDP      | everyone | TURN over UDP                                                |
| 5349        | TCP      | everyone | TURN over TLS                                                |

Example with ufw: `ufw allow 7881/tcp`, `ufw allow 50000:50499/udp`, `ufw allow 3478/udp`,
`ufw allow 5349/tcp` (443 is open for the site already). The range is narrow on purpose
(LiveKit's default is 50000–60000); if a call ever needs more participants, widen
`port_range_end` and the firewall rule together.

### TURN

LiveKit's built-in TURN server is on for production: listeners behind strict company or
hotel firewalls reach the call over TURN/TLS on 5349, which looks like ordinary TLS. It needs a
TLS certificate for the calls domain (e.g. from certbot, the same one the reverse proxy uses):
put `fullchain.pem` and `privkey.pem` in a folder and set `CALLS_CERT_DIR` to it. Renewing the
certificate needs `docker compose restart`.

### Starting it

On the server, in `deploy/calls/`: copy `.env.example` to `.env`, fill it in, then
`docker compose up -d`. The reverse proxy forwards `wss://<calls domain>` to `127.0.0.1:7880`
(WebSocket upgrade on). The site's `CALLS_URL` is `wss://<calls domain>`.

### Moving the call service to its own VPS

Nothing in the site changes except one setting:

1. On the new VPS: install Docker, copy the folder `deploy/calls/` there (with its `.env`).
2. Point the calls domain's DNS record at the new VPS; get its certificate there
   (`CALLS_CERT_DIR`).
3. Set up the reverse proxy on the new VPS: `wss://<calls domain>` → `127.0.0.1:7880`.
4. Open the firewall ports above on the new VPS.
5. `docker compose up -d` in `deploy/calls/`.
6. On the site's server: set `CALLS_URL` to the new origin if the domain changed (same domain:
   nothing to change), restart the site. The CSP follows `CALLS_URL` by itself.
7. Stop the call service on the old VPS (`docker compose down`) and close its ports there.

Live calls are cut off by the move; do it when no call is live.

## Development

`npm run dev:calls` starts the pinned LiveKit server (v1.13.10) in development mode on
`ws://127.0.0.1:7880` with LiveKit's development pair `devkey` / `secret`
(`scripts/calls-dev.mjs`). The first run downloads the release archive for this platform into
`.calls-bin/` (gitignored) and checks its SHA-256 against the value pinned in
`scripts/calls-binary.mjs`; a mismatch stops it before anything runs. Then start the site with
`CALLS_URL=ws://127.0.0.1:7880 CALLS_API_KEY=devkey CALLS_API_SECRET=secret npm run dev` (or
put the three keys in `.env`).

Pinned binaries exist for Windows x64 and Linux x64/arm64. **macOS** has no release binary:
install it by hand (`brew install livekit`, then check `livekit-server --version` shows
1.13.10) and run `livekit-server --dev --bind 127.0.0.1`.

## Security headers

With calls configured, the CSP's `connect-src` holds this origin plus exactly the call
service's origin: `CALLS_URL` itself (signalling over WebSocket) and the same host over https
(livekit-client checks the connection there after a failed connect). Media flows over WebRTC,
which the CSP does not govern. Nothing else is loosened. `Permissions-Policy:
camera=(self), microphone=(self), display-capture=(self)` lets only the site itself ask for the
camera, the microphone and screen capture (`server/src/http/securityHeaders.js`,
`server/test/callsConfig.test.js`).
