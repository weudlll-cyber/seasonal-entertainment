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
  disconnected) and closes the call's chat (`server/src/calls/endCall.js`, the one way a call
  ends).
- **Stale live calls** (SE-NIGHT-2 part 2): a call marked live whose room no longer exists on
  the call service — everyone left and the service closed the room, or the service restarted —
  is ended by the site **10 minutes** after the room was first found missing (decision rule of
  2026-10-18; the owner may change it). It ends exactly like "End call": status `ended`, the
  chat read-only, an audit entry `call.end` with the actor **system**. The job
  (`server/src/calls/staleCalls.js`) checks at server start and then every minute; the time a
  room was first missing is stored (`calls.room_missing_since`), so a restart neither resets
  nor skips the grace, and a room that comes back clears it. A call service that cannot be
  reached ends nothing (the check is skipped and logged). Off when `backgroundJobs` is off,
  like the chat retention.
- **Call chat**: every call gets a chat room of the existing chat module (`call-<id>`, "Call:
  <title>"), readable and writable by everyone; guests may write there when they may in General
  at the moment the call is created (decided 2026-10-18). It is **unlisted** (not in the room
  lists or the unread counters) and becomes **read-only** when the call ends; its messages
  follow the normal retention (docs/CHAT.md, "Server").
- **Empty lists** (2026-10-21): an empty "Live now", "Upcoming" or "Recent" shows a card in the
  page's style ("No call is live right now", "No call is planned yet — organisers announce them
  here", "No calls yet"), never a bare "None.".
- **In the event lists** (2026-10-21): the home page's "Up next" and `/events` show the site's
  live and planned calls among the event bot's occurrences, by start time
  (`client/src/calls/callEntries.js`). Both read the Calls page's own `GET /api/calls` answer
  (`client/src/calls/useCalls.js`, also behind the home's Next call box), so a viewer sees
  exactly the calls the Calls page shows them; ended calls are not listed. A call entry has the
  title linking to `/calls/<id>`, its date in the site's format (docs/DESIGN.md, "Dates") or
  "Live now", and the calls quarter as its picture (`/events`: `CallEventItem.jsx`). A live
  call is placed at its start; a planned call without a time has no place in a list by time
  (the Calls page and the Next call box still show it). "Up next" covers its seven days, and a
  planned call whose time has passed but that has not started comes first, as the Calls page
  still lists it; `/events` shows the calls of the week on screen. While calls are not set up,
  both lists show the bot's events only. The home's Next call box shows only with a live or
  planned call (docs/DESIGN.md, "Home"). Tests: `client/src/pages/LandingPage.test.jsx`,
  `eventsPage.test.jsx`, `homeLive.test.jsx` and `client/e2e/layout.spec.js`.
- **Calendar file** (decided 2026-10-21): every planned call (scheduled, with a planned time)
  has `GET /api/calls/:id/calendar.ics` for everyone, guests included (`allow('public')`, as the
  list; rate limit `callCalendar` per address, 60 a minute). `text/calendar` as a download
  (`seasonal-call-<id>.ics`), RFC 5545 (`server/src/calls/calendar.js`): a stable UID per call
  (`call-<id>@<site host>`), DTSTAMP, DTSTART and DTEND in UTC (calls have no planned end:
  start + 60 minutes), SUMMARY the title, DESCRIPTION the description and the call page's
  address (from `PUBLIC_ORIGIN`, as the CSRF check uses it), one display alarm 15 minutes
  before. Text is escaped (backslash, semicolon, comma, line breaks) and lines over 75 octets
  folded. Nothing that the Calls page does not show. "Add to calendar" sits beside each planned
  call on the Calls page and in the home page's "Next call" box
  (`client/src/calls/CallActions.jsx`).
- **Reminders** ("Remind me on this site", members only; decided 2026-10-21): a toggle beside
  "Add to calendar" stores a reminder for (member, call) (`PUT` / `DELETE
/api/calls/:id/reminder`, `allow('member')`, rate limit `callAction`; table `call_reminders`).
  `GET /api/calls` names the member's reminded calls (`reminders`). A reminder goes when the
  member turns it off, when the call ends (`endCall.js`) and with the account or call
  (cascades). Guests see no toggle.
  - **The notices**: 10 minutes before a reminded call's planned start ("<title> starts in 10
    minutes") and when it goes live ("<title> is live now"), every open page of the member shows
    a notice with **Listen** and **Dismiss** at the top of the main column
    (`client/src/calls/CallNotices.jsx`). The server pushes it as a personal event
    (`callReminder`) over the chat's live connection (`chat.notify.member`, docs/CHAT.md); there
    is no polling.
  - **Once per kind**: each kind is marked in `call_reminders` (`soon_sent_at`, `live_sent_at`)
    only once it reached an open page, so a member who opens the site within the window still
    gets it, and a restart never repeats one. Dismissing in one tab dismisses it in the others
    (browser storage `se.callNotice.<call>.<kind>`). Nothing shows on that call's own page.
  - **The job** (`server/src/calls/reminders.js`, like the stale-call job): at server start,
    every 30 seconds, and a round at once when a call is started. Off when `backgroundJobs` is
    off.
  - The site had no general on-site notification before; the notices use the shell's banner
    style (`.banner`, as the staff 2FA banner) and the chat's existing personal-event push.
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

**A share never depends on the spotlight** (2026-10-18, SE-CALLS-2). Every page shows a
published screen share by itself: without a spotlight from the server it shows the share large
(the last sharer), and a sharing speaker's tile shows the screen instead of the camera in any
layout; only an organiser's explicit "all speakers" keeps the grid. A failed spotlight update
(database or call service) is written to the server log with its details
(`[calls] spotlight update failed for call …`), answered with a generic message only (503
`spotlight_unavailable`, "The spotlight could not be changed right now.") and leaves the call
working.

What happened in the eye test of 2026-10-18: the development database's `calls` table had been
made before the spotlight columns existed (`CREATE TABLE IF NOT EXISTS` keeps an older table),
so every spotlight request failed (`SqliteError: no such column: spotlight_identity`); the
presenter saw "Something went wrong on the server." and the listener, whose page then showed a
share only in the spotlight, kept seeing the camera. `migrateCalls()` now adds the columns to
an older table on start; `server/test/callSpotlightResilience.test.js` and
`client/e2e/callShare.spec.js` guard both sides.

## The call page

`/calls/:id` (`client/src/pages/CallPage.jsx`, parts in `client/src/calls/`; layout:
docs/DESIGN.md, "Call page"). Not live: whether it has not started or has ended, and the call's
chat (read-only after the end).

- **Join call**: nothing connects and no sound plays before this button — browsers block sound
  until the visitor has clicked (`useCallRoom.js`: the join token, `room.connect`, then
  `room.startAudio()`).
  The page gives the stage the room (2026-10-18, SE-CALLS-3): the sidebar becomes an icon rail
  (docs/DESIGN.md, "Call page"), the chat can be collapsed, and from 1280 x 720 nothing scrolls in
  the main column during a share.

- **Stage**: takes all the height the page has left. An adaptive grid of up to 10 speakers
  (their shared screen, else camera or initial; name, Host/Speaker, microphone state, a ring for
  whoever talks); with a spotlight (or a share without one), that speaker large — their shared
  screen, **never cropped** (letterboxed, `object-fit: contain`; only camera pictures fill their
  tile), with their camera inset, or their camera — and the other speakers in a strip. Chips over
  the stage's top left: "<name> is sharing the screen" (a sound icon when the share carries
  audio), "Show all speakers" for organisers, "Put me in the spotlight" / "Leave the spotlight"
  for a speaker. Organisers have a "…" menu on every other speaker (Spotlight, Mute, Remove from
  the stage — this one asks first). Cameras: a lone speaker's camera is never cropped; in the
  grid each picture takes its camera's shape (docs/DESIGN.md, "Call page"). Top right: **Full
  screen** (the browser's Fullscreen API;
  Esc or the button leaves it; not shown where the API is unavailable).
- **Control bar**: one row of round icon buttons, each with a visible tooltip and its name.
  Speakers: microphone, camera, share screen, then leave the stage; member listeners: raise or
  lower the hand (guests have none); organisers: end the call for everyone (red; asks first);
  everyone: leave the call. A toggle's name and tooltip say what a click will do, its icon the
  current state (2026-10-18, SE-CALLS-4): **Mute microphone** (microphone) / **Unmute
  microphone** (slashed microphone, red); **Turn camera off** (camera) / **Turn camera on**
  (slashed camera, red); **Share screen** (screen) / **Stop sharing** (slashed screen,
  highlighted). `aria-pressed` holds the state; a raised hand shows in autumn orange.
- **Listeners**: collapsed by default to one row — every raised hand first (organisers never miss
  one; more than fit scroll sideways), then a few more chips — with "+N" and "Show all
  listeners"; expanded, "Find a listener" (the site's search field) and the whole list, scrolling
  inside its capped height. One chip per listener: an initial circle and the name; raised hands
  marked in autumn orange with the hand symbol; guests tagged; hidden listeners ("A listener", a
  neutral circle) last. Organisers invite members with a compact Invite button inside the chip; a
  hidden listener's button is numbered by position ("Invite listener 2 to the stage").
- **Chat**: the chat module's compact `ChatPanel` with the call's room (`unlisted`), on the
  right — the same one-row composer as the chat drawer. A collapse button turns it into a slim
  vertical tab with how many messages arrived meanwhile (`useNewMessageCount`); this browser
  remembers the choice (`se.callChat.collapsed`). On narrow screens a drawer over the page.

**Screen sharing with sound**: Share screen first shows "use headphones, so the call does not
hear itself (echo)"; Share now asks the browser for the screen with its sound
(`getDisplayMedia` audio, system audio included where supported, the presenter's own playback
of it suppressed where supported). When the share comes without a sound track:

- **Chrome, Edge and other Chromium browsers** can send sound, but only for the whole screen
  with "Share system audio" ticked, or a browser tab with "Share tab audio"; a single window
  never carries sound on Windows. The page says: "No sound is being shared. For sound, choose
  'Entire screen' and tick 'Share system audio', or a browser tab with 'Share tab audio'." with
  a button **Share again with sound**, which stops the share and asks the browser once more.
- **Browsers without screen-share sound** (Firefox, Safari): "Your browser can't send sound with
  screen sharing — for presentations with sound use Chrome or Edge."

Chromium is recognised by Client Hints where offered, else by the user agent (`Chrome/`,
`Edg/`; `stageModel.isChromium`). The presenter's page tells the server when the share starts
and stops (it takes the spotlight).

**Bandwidth**: listeners never publish. The page connects with adaptive stream (each video is
received at the size it is shown), dynacast (layers nobody watches are paused) and simulcast
(speakers send several qualities), so each listener gets the layer that suits them.

**Tests**: `client/src/calls/*.test.*` (rules, parts, the page with a stand-in for
livekit-client) and `client/e2e/calls.spec.js`, which runs a whole call against the run's own
LiveKit server (port 7890, the pinned binary; CI fetches it checksum-checked first) with
Chrome's fake camera, microphone and screen: the organiser starts and joins on the stage, a
member joins as a listener (the call server confirms they cannot publish), raises a hand, is
invited and publishes audio, a screen share puts them in the spotlight for a guest listener (who
has no hand button), and ending the call disconnects everyone. The call specs open a call page through
`client/e2e/callPage.js`, which rests the pointer over the stage: Playwright's pointer starts on
the sidebar rail, whose hover overlay would otherwise cover the page's left edge for good (it
did on CI's Linux runner, 2026-10-18).

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

A presenter whose share has no sound is told how to get it (Chrome and Edge: which choice in
the browser's share dialog carries sound, and "Share again with sound") or that the browser
cannot send it (Firefox, Safari): "The call page" above. Listening and speaking work in all
current browsers.

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
TLS certificate for the calls domain: Caddy (the reverse proxy) gets and renews it, and
`deploy/site/calls-cert.sh` (daily, from a systemd timer) copies it as `fullchain.pem` and
`privkey.pem` into `CALLS_CERT_DIR` and restarts LiveKit when it changed (docs/DEPLOYMENT.md).

### Starting it

On the server, in `deploy/calls/` (its own compose project, `seasonal-calls`): copy
`.env.example` to `.env`, fill it in, then `docker compose up -d`. On the site's VPS the site's
Caddy forwards `wss://<calls domain>` to LiveKit (`deploy/site/caddy/calls.caddy`); on a VPS of
its own, `docker compose --profile proxy up -d` also starts a Caddy for it
(`deploy/calls/Caddyfile`). The site's `CALLS_URL` is `wss://<calls domain>`. Step by step:
docs/DEPLOYMENT.md.

### Moving the call service to its own VPS

Nothing in the site changes except one setting:

1. On the new VPS: install Docker, copy the folder `deploy/calls/` there (with its `.env`).
2. Point the calls domain's DNS record at the new VPS; get its certificate there
   (`CALLS_CERT_DIR`).
3. The reverse proxy on the new VPS: set `ACME_EMAIL` in `deploy/calls/.env` and start with
   `docker compose --profile proxy up -d` in step 5 (its own Caddy); delete
   `deploy/site/caddy/calls.caddy` on the site's VPS and restart its Caddy.
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
