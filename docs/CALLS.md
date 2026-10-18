# CALLS.md — community calls

Community calls (decided 2026-10-18): a stage with up to 10 speakers and 100–200 listeners.
Video only for speakers, never for listeners; presenting is screen sharing, with system audio
where the browser allows. The call service is **LiveKit** (open source, Apache-2.0,
self-hosted). For now it runs on the same VPS as the site; moving it to its own VPS is a
configuration change only (below).

## Architecture

```
browser ──https──> site (Node, /api/calls/*) ──RoomService API──> call service (LiveKit)
   │                    │ issues a join token                          ▲
   │                    └ sets permissions, attributes, room metadata ─┘
   └──wss + WebRTC (UDP/TCP, TURN) with the token ─────────────────────┘
```

- **The site is the only authority.** It decides who may join and what they may do, and puts
  exactly that into a short-lived token (`server/src/calls/grants.js`). Every later change —
  hands, the stage, muting, the spotlight, ending — goes through the site's API, which audits
  the organisers' actions and applies them on the call service with LiveKit's RoomService
  (`server/src/calls/service.js`, the one door to it). Browsers cannot change their own
  permissions, names, attributes or metadata.
- **The call service** (LiveKit, self-hosted, `deploy/calls/`) carries the media: it receives
  what speakers publish and forwards it to everyone else (an SFU); nothing is recorded.
- **The browser** (`client/src/calls/`, livekit-client) connects with the token, shows what the
  call service sends and what the site set (attributes, metadata), and asks the site for
  everything else.
- **The call chat** is a room of the site's own chat module (docs/CHAT.md), unlisted.
- Server modules: `config.js` (keys), `service.js`, `schema.js`, `store.js`,
  `participants.js`, `people.js`, `grants.js`, `spotlight.js` + `spotlightUpdate.js`,
  `middleware.js`, routes (`routes.js` management, `joinRoutes.js`, `stageRoutes.js`,
  `spotlightRoutes.js`); settings in `server/src/settings/`. Growing beyond one server:
  docs/SCALING.md.

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

## Calls on the site

- **`/calls`**: live calls on top, then upcoming (planned time first) and the ten most recent.
  The sidebar's **Calls** item (after Chat) carries a red **LIVE** badge while any call is live
  (`GET /api/calls/summary`, public; asked on load, every minute and right after a change on
  the page). Without a call service the item is hidden, except for admins, whose page says
  "not configured".
- **Who may do what**: organisers and admins (with their 2FA set up) create, start and end calls
  (`POST /api/calls`, `/api/calls/:id/start`, `/api/calls/:id/end`; `allow('organiser')`, rate
  limit `callManage` per account, an audit entry `call.create` / `call.start` / `call.end`
  each). Everyone may see the list and a call.
- **Status**: `scheduled` → `live` → `ended`, or `scheduled` → `ended` (cancelled); never back.
  A change applies only from the expected status, so two organisers acting at once cannot both
  succeed. Starting opens the call's room on the call service with the participant cap; ending
  marks the call ended first (nobody can join any more), then deletes the room (everyone is
  disconnected) and closes the call's chat.
- **Call chat**: every call gets a chat room of the existing chat module (`call-<id>`, "Call:
  <title>"), readable and writable by everyone; guests may write there when they may in General
  at the moment the call is created (decided 2026-10-18). It is **unlisted** (not in the room
  lists or the unread counters) and becomes **read-only** when the call ends; its messages
  follow the normal retention (docs/CHAT.md, "Server").
- **Settings** (Admin → Settings, `/api/admin/settings`, audited `setting.change`): speakers on
  stage at most (default 10, 1–25) and participants per call at most (default 250, 2–1000;
  the call service's UDP range is sized for 250).

## Joining, hands and the stage (the server decides)

The server is the only authority over what anyone may do in a call; the browser only ever
holds a token the server signed. Routes: `server/src/calls/joinRoutes.js`, `stageRoutes.js`,
`spotlightRoutes.js`; grants: `grants.js`.

**Joining** (`POST /api/calls/:id/join`, everyone; limit `callJoin` per address): only a live
call (scheduled: 409 `not_started`, ended: 410 `call_ended`). Members join by account, guests by
their chat guest identity (given now if they have none, docs/CHAT.md). Refused for anyone banned
in the chat (403 `banned`) and when the call already has as many participants as the setting
allows (403 `call_full`; someone already in it may rejoin). A locked account is logged out on
its next request, so it can only come back as an anonymous guest listener. Every person gets
one random identity per call (`p-…`, `call_participants`), which says nothing about the account.
The answer is the call service URL and a token valid for 10 minutes (LiveKit renews it for a
running connection):

| Who                             | `canSubscribe` | `canPublish` | `canPublishSources`                                  | `canPublishData` | `canUpdateOwnMetadata` |
| ------------------------------- | -------------- | ------------ | ---------------------------------------------------- | ---------------- | ---------------------- |
| listener (member or guest)      | yes            | no           | none                                                 | no               | no                     |
| speaker (invited; or organiser) | yes            | yes          | microphone, camera, screen share, screen share audio | no               | no                     |

Organisers and admins (2FA in order) join on the stage while it has room, otherwise as
listeners. Guests are never given publishing. The token also carries the name others see — a
member's username, a guest's guest name; a member who hides their online status listens as
**"A listener"** (counted, not named; on the stage everyone is named) — and attributes every
client reads: `kind` (`host`, `member`, `guest`), `hand` and `handAt`.

**Hands** (`POST /api/calls/:id/hand {raised}`, members only — guests cannot raise hands; limit
`callAction`): stored on the server and set as the participant's attributes on the call service,
so every client sees one truth and organisers can sort raised hands first.

**The stage** (organisers and admins; each audited and limited per account):

- **Invite** (`POST /api/calls/:id/stage/:identity`): gives the speaker permission above and the
  member's real name, lowers the hand. Refused for guests (`guest_listener`), members muted or
  banned in the chat (`sanctioned`; they may still listen), people not connected right now
  (`not_connected`) and when the stage already has as many speakers as the setting allows
  (`stage_full`; counted from who may publish right now on the call service).
- **Remove** (`DELETE /api/calls/:id/stage/:identity`): back to the listener permission; the call
  service unpublishes their tracks. A speaker may also leave by themselves
  (`POST /api/calls/:id/leave-stage`).
- **Mute** (`POST /api/calls/:id/mute/:identity`): mutes the speaker's microphone tracks (the
  speaker may unmute again); camera and screen share stay.
- **End**: see "Calls on the site".

### Spotlight

Who is shown large is stored by the server and set as the room's metadata
(`{"spotlight": {"identity", "by"} | null}`), which every client reads (rules:
`server/src/calls/spotlight.js`):

- A **screen share** always takes the spotlight; the newest share wins. The sharing speaker's
  client reports start and stop (`POST /api/calls/:id/spotlight/share {sharing}`); the server
  checks that they are on the stage.
- A **speaker** may highlight themselves (`POST /api/calls/:id/spotlight/self {on}`), unless an
  organiser's choice stands (409 `organiser_choice`).
- An **organiser** may highlight any speaker or return to all speakers
  (`PUT /api/calls/:id/spotlight {identity | null}`, audited); that choice stands until an
  organiser or a new screen share changes it.
- Stopping one's share, or leaving the stage, releases one's own spotlight (back to all
  speakers).

## The call page

`/calls/:id` (`client/src/pages/CallPage.jsx`, parts in `client/src/calls/`; layout:
docs/DESIGN.md, "Call page"). Not live: whether it has not started or has ended, and the call's
chat (read-only after the end).

- **Join call**: nothing connects and no sound plays before this button — browsers block sound
  until the visitor has clicked (`useCallRoom.js`: the join token, `room.connect`, then
  `room.startAudio()`).
- **Stage**: an adaptive grid of up to 10 speakers (camera or initial, name, Host/Speaker,
  microphone state, a ring for whoever talks); with a spotlight, that speaker large — their
  shared screen with their camera inset and "<name> is sharing the screen" (a sound icon when
  the share carries audio), or their camera — and the other speakers in a strip. Organisers:
  Spotlight / Mute / Remove on each speaker and "Show all speakers"; a speaker: "Put me in the
  spotlight".
- **Listeners**: how many, "Find a listener", raised hands first and marked, guests tagged,
  hidden listeners ("A listener") last; organisers invite members from here.
- **Controls**: speakers — Microphone, Camera, Share screen, Leave the stage; member listeners —
  Raise / Lower hand (guests have none); organisers — End call for everyone; everyone — Leave
  call.
- **Chat**: the chat module's `ChatPanel` with the call's room (`unlisted`), on the right; on
  narrow screens a drawer over the page.

**Screen sharing with sound**: Share screen first shows "use headphones, so the call does not
hear itself (echo)"; Share now asks the browser for the screen with its sound
(`getDisplayMedia` audio, system audio included where supported, the presenter's own playback
of it suppressed where supported). When the share comes without a sound track the page says:
"Your browser can't send sound with screen sharing — for presentations with sound use Chrome or
Edge." The presenter's page tells the server when the share starts and stops (it takes the
spotlight).

**Bandwidth**: listeners never publish. The page connects with adaptive stream (each video is
received at the size it is shown), dynacast (layers nobody watches are paused) and simulcast
(speakers send several qualities), so each listener gets the layer that suits them.

**Tests**: `client/src/calls/*.test.*` (rules, parts, the page with a stand-in for
livekit-client) and `client/e2e/calls.spec.js`, which runs a whole call against the run's own
LiveKit server (port 7890, the pinned binary; CI fetches it checksum-checked first) with
Chrome's fake camera, microphone and screen: the organiser starts and joins on the stage, a
member joins as a listener (the call server confirms they cannot publish), raises a hand, is
invited and publishes audio, a screen share puts them in the spotlight for a guest listener (who
has no hand button), and ending the call disconnects everyone.

## Browser support for screen sharing with sound

What browsers send with a screen share (as far as known on 2026-10-19 — **to be re-checked**
before go-live and whenever browsers change):

| Browser                  | Sound of a shared tab | System sound (whole screen)        | Notes                             |
| ------------------------ | --------------------- | ---------------------------------- | --------------------------------- |
| Chrome / Edge on Windows | yes                   | yes                                | the best choice for presentations |
| Chrome on macOS          | yes                   | yes from Chrome 141 on macOS 14.2+ | older: tab sound only             |
| Chrome / Edge on Linux   | yes                   | no                                 | tab sound only                    |
| Firefox                  | no                    | no                                 | screen without sound              |
| Safari                   | no                    | no                                 | screen without sound              |

Whatever the browser, the page tells a presenter whose share has no sound: "Your browser can't
send sound with screen sharing — for presentations with sound use Chrome or Edge." Listening and
speaking work in all current browsers.

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
