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

| Variable                  | Example                   | Meaning                                                              |
| ------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `CALLS_URL`               | `wss://calls.example.org` | the call service's public WebSocket origin (no path)                 |
| `CALLS_API_KEY`           | `APIxxxxxxxx`             | LiveKit API key                                                      |
| `CALLS_API_SECRET`        | (32+ characters)          | LiveKit API secret                                                   |
| `CALLS_RECORDINGS_DIR`    | `/data/media/recordings`  | optional: call recording on; where the recordings land ("Recording") |
| `CALLS_EGRESS_OUTPUT_DIR` | `/recordings`             | the same folder as the egress service sees it (default: as above)    |

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
  each). Admins alone delete an ended call ("Deleting a call" below). Everyone may see the list
  and a call.
- **Starting a call** (decided 2026-11-06): in the "New call" form the button reads **Start call
  now** while "Planned start (optional)" is empty and **Create call** once a time is set, as the
  field changes. "Start call now" makes the two calls an organiser would (`POST /api/calls`,
  then `POST /api/calls/:id/start`), opens the call's page and joins the organiser there; a
  planned call is only created, as before. "Start <title>" on a planned call's card also opens
  its page and joins. The join is the page's own ("Join call", `useCallRoom.js`), asked for
  through react-router's navigation state and taken once (`client/src/calls/callIntent.js`):
  the page clears it on arrival, so a reload or a later visit never joins by itself. A join that
  fails shows the Join button and its error; a start that fails after the create opens the
  still planned call with the error.
  Joined that way, the organiser's **microphone goes on** and the camera stays off (decided
  2026-11-09): once, when they are on the stage (organisers start there while it has room),
  through the microphone button's own toggle, so a running recording asks for consent first and
  a microphone the browser refuses leaves the call joined with the error shown (`CallPage.jsx`).
  An ordinary join ("Join call", a reload, a later visit) turns nothing on. No server route of its own. Tests:
  `client/src/calls/quickStart.test.jsx`.
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
- **Call chat**: every call gets a chat room of the existing chat module (`call-<id>`,
  `shared/callRoom.js`, "Call: <title>"), readable and writable by everyone; guests may write there when they may in General
  at the moment the call is created (decided 2026-10-18). It is **unlisted** (not in the room
  lists or the unread counters) and becomes **read-only** when the call ends; its column then
  says "This call's chat is closed." and, without messages, "No messages in this call." inside
  its box (never a blank box, seen 2026-11-13; `CallChat.jsx`). Its messages follow the normal
  retention (docs/CHAT.md, "Server"). Links into it lead to the call's page:
  a mention's notification opens `/calls/<id>` (docs/CHAT.md, "Notifications").
- **Deleting a call** (decided 2026-11-04: a technical test call leaves nothing visible):
  `DELETE /api/calls/:id`, **admins only** (with their 2FA set up; `allow('admin')`, organisers
  get 403), rate limit `callManage` per account like the other call actions, and **only an ended
  call**: a live one answers `409 not_ended` "End the call first: a live call cannot be
  deleted.", a planned one "Cancel the call first: only an ended call can be deleted." (cancelling
  ends it), and one whose recording still runs `409 recording_running`. One transaction
  (`server/src/calls/deleteCall.js`) removes:
  - the call row, and with it by cascade its participants (`call_participants`), reminders
    (`call_reminders`), recordings (`call_recordings`) and their chapter marks
    (`call_recording_chapters`); the link to an event bot occurrence is two columns of that row,
    and the bot's own data is never touched;
  - its chat room (`server/src/chat/roomDeletion.js`, through the chat handle's
    `rooms.remove`): the uploads of its messages (`chat_uploads`, whose `message_id` would
    otherwise only be set to NULL), its read markers (`chat_reads`, which name a room by id
    only) and the room (`chat_rooms`), whose messages (`chat_messages`), their reports
    (`chat_reports`) and mentions (`chat_mentions`), favourites (`chat_favourite_rooms`), mutes
    (`chat_room_mutes`) and step rules (`room_step_rules`) follow by cascade;
  - and writes the audit entry `call.delete` (who, when, the call's id, its title in `before`),
    which stays like every audit entry.

  After the commit the files go: the recordings' MP4s in the recordings folder and the chat
  uploads with their thumbnails. A page still on the call's chat hears `not_allowed` for its
  room (the hub's `roomGone`), as when a reader loses a room; the call's page and lists show
  "No such call." / no longer list it on their next load. Not deleted: chat sanctions (they name
  a person across the whole chat, not a room) and link previews (a shared cache, cleaned by the
  chat retention once no message uses them). In the browser: "Delete <title>" on an ended call in
  "Recent" and "Delete call" on its page, for admins only (`canDelete` in the calls answers),
  after a confirmation naming the call and saying that its chat and recordings go too
  (`client/src/calls/deleteCall.js`). Tests: `server/test/callDelete.test.js`,
  `client/src/calls/callDelete.test.jsx`, `client/e2e/callDelete.spec.js`.

- **Empty lists** (2026-10-21): an empty "Live now", "Upcoming" or "Recent" shows a card in the
  page's style ("No call is live right now", "No call is planned yet" with "Organisers announce
  the next community calls here.", "No calls yet"), never a bare "None.".
- **In the event lists** (2026-10-21): the home page's "Up next" and `/events` show the site's
  live and planned calls among the event bot's occurrences, by start time
  (`shared/callEntries.js`). Both read the Calls page's own `GET /api/calls` answer
  (`client/src/calls/useCalls.js`, also behind the home's Next call box), so a viewer sees
  exactly the calls the Calls page shows them; ended calls are not listed. A call entry has the
  title linking to `/calls/<id>`, its date in the site's format (docs/DESIGN.md, "Dates") or
  "Live now", and the calls quarter as its picture. On `/events` (`CallEventItem.jsx`) the
  day's heading and the time column carry the date, so its line just says "Community call on
  this site" (or "Live now"). A live
  call is placed at its start; a planned call without a time has no place in a list by time
  (the Calls page and the Next call box still show it). "Up next" covers its seven days, and a
  planned call whose time has passed but that has not started comes first, as the Calls page
  still lists it; `/events` shows the calls of the week on screen. While calls are not set up,
  both lists show the bot's events only. The home's Next call box shows only with a live or
  planned call (docs/DESIGN.md, "Home"). Tests: `client/src/pages/LandingPage.test.jsx`,
  `eventsPage.test.jsx`, `homeLive.test.jsx` and `client/e2e/layout.spec.js`.
- **Linked to a bot event** (decided 2026-10-22): when creating a call, or later on a planned
  call's card on the Calls page, an organiser may pick one of the event bot's upcoming
  occurrences (the next 30 days, scheduled only; `GET /api/calls/bot-occurrences`, organisers
  and admins) or "No event". The picker reads the bot's file read-only through the existing
  reader (`server/src/bots/events.js`). The link is kept on the site's side only, as the call's
  `bot_occurrence_id` and `bot_occurrence_start` (`server/src/calls/eventLink.js`). It is set
  by `POST /api/calls { botOccurrenceId }` and changed by `PUT /api/calls/:id/event
{ botOccurrenceId | null }` (planned calls only, audited as `call.event`). An occurrence that
  is not one of the upcoming ones is refused (`unknown_event`).
  - **One entry per date** (decided 2026-11-02): the bot keeps one occurrence per channel, and
    the site lists them as one entry with the lowest copy's id and `ids`, every copy's
    (docs/BOTS.md). The picker sends the entry's id; any copy's id is accepted and the entry's id
    is stored. A link saved before (naming whichever channel's copy) still finds its entry: the
    call's page, "Up next", `/events` and the card's picker all match any copy's id.
  - **Shown**: in "Up next" and on `/events`, the linked occurrence offers "Listen on this
    site" (to the call's page), and the call is not listed a second time; while the call is
    live, the event shows "Live now". The match is by one of the occurrence's copy ids **and** its start
    (`withCalls` in `shared/callEntries.js`), from the Calls page's own answer, so a
    viewer sees the link only for the live and planned calls the Calls page shows them. The
    call's page names the event ("Event: <name>"; `GET /api/calls/:id` answers `event`).
  - **The bot changes its mind**: if the occurrence disappears or moves, the call keeps its own
    time and simply loses the link display, with no error. It is then listed as itself, and
    its page names no event. An unreadable bot file counts the same (logged).
  - Tests: `server/test/callEventLink.test.js`; `LandingPage.test.jsx`, `eventsPage.test.jsx`,
    `callsPage.test.jsx`, `callPage.test.jsx`.
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
  - **The notices**: the lead time before a reminded call's planned start (the "Reminder before a
    call" setting, 10 minutes by default; "<title> starts in N minutes", counted to the start) and
    when it goes live ("<title> is live now"), every open page of the member shows a notice with
    **Listen** and **Dismiss** at the top of the main column (`client/src/calls/CallNotices.jsx`).
    The server pushes it as a personal event (`callReminder`) over the chat's live connection
    (`chat.notify.member`, docs/CHAT.md); there is no polling.
  - **Once per kind**: each kind is marked in `call_reminders` (`soon_sent_at`, `live_sent_at`)
    only once it reached an open page, so a member who opens the site within the window still
    gets it, and a restart never repeats one. Dismissing in one tab dismisses it in the others
    (browser storage `se.callNotice.<call>.<kind>`). Nothing shows on that call's own page.
  - **The job** (`server/src/calls/reminders.js`, like the stale-call job): at server start,
    every 30 seconds, and a round at once when a call is started. Off when `backgroundJobs` is
    off.
  - The site had no general on-site notification before; the notices use the shell's banner
    style (`.banner`, as the staff 2FA banner) and the chat's existing personal-event push.
- **Settings** (Admin → Settings, group "Calls", docs/SETTINGS.md): speakers on
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

## Polls in a call

Organisers and admins start a poll from a live call's page; it shows under the stage with a
countdown (1, 2 or 5 minutes, or by hand) and ends with the call at the latest (docs/POLLS.md,
"Polls in a call"; decided 2026-11-10).

## Push when a call starts

One web push, decided 2026-11-10: when a call goes live (started at once, or a planned call
started), every member who turned it on for a device gets "<call title> has started" there,
also while the site and the browser are closed; a click opens the call's page, and only a
path of this site: the service worker (`client/src/app/sw.js`) checks it with the login's rule,
`shared/localPath.js`, which `client/serviceWorkerPlugin.js` puts in front of it as `/sw.js`
(2026-11-13).

- **The switch**: "When a call starts (on this device, also while the site is closed)" in the
  account page's Notifications section (`client/src/notify/PushSwitch.jsx`), off until the
  member turns it on, per device: turning it on asks the browser's permission and subscribes
  this browser; each device is turned on by itself. Members only; guests never have it. Not
  shown while the site has no push keys; where the browser cannot receive push, a line says so
  instead.
- **Logging out** turns it off for this device (decided 2026-11-13): before the logout itself,
  the device's subscription is removed on the server and in the browser (`pushOffForLogout`,
  `client/src/notify/pushPending.js`, at most 3 s), and an unfinished turn-on's mark goes. A
  turn-on still running hands the server its subscription only after asking who is signed in:
  if it is no longer its own account, it undoes the browser's part instead, so it never
  finishes under the next account in the same tab.
- **No waiting** (decided 2026-11-13): a click shows the switch on at once. The browser's
  registration and the server request finish in the background
  (`client/src/notify/pushPending.js`), with "Finishing in the background…" under the switch
  meanwhile and the rest of the page usable. Going to another page of the site keeps it
  running; a page closed or reloaded meanwhile leaves a mark in the browser's storage, and the
  next page load of the site finishes it (`useResumePush`, `client/src/app/Layout.jsx`). The
  background part has 90 s (`SUBSCRIBE_MS`, `client/src/notify/push.js`).
- **Why Chrome can take a minute** (measured 2026-11-13 on the owner's PC with
  `chrome://gcm-internals`): Chrome's push client connects to its service (`mtalk.google.com`)
  at once, but a profile's first registration requests go out before its device check-in has
  finished, are answered "DEVICE_REGISTRATION_ERROR" or "UNKNOWN_ERROR", and Chrome waits its
  own retry delay (23–42 s) before the next one succeeds: 23–62 s in all. Once Chrome's push
  client is ready, a registration takes about 2 s (1.6 s measured). This happens in Chrome,
  roughly once per browser profile; the network was fine (ports 5228 and 443 answer in about
  35 ms, no proxy, no firewall rule against Chrome).
- **Never a silent failure** (decided 2026-11-12, after the switch stayed off without a word in
  Chrome on the PC): only a final failure turns the switch back off, with a line under it saying
  why and what to do (`client/src/notify/pushFailure.js`): notifications blocked for the site
  (allow them in the site settings), the permission question closed or not shown, the browser's
  push service not answering in time, the browser's own refusal (its reason in brackets), or the
  server's refusal (its message). A failure while the account page was not open is shown there
  next time. Tests: `client/src/notify/pushSwitch.test.jsx`.
- **Only this**: chat, rooms, polls and everything else still notify only while a tab of the
  site is open (docs/CHAT.md, "Notifications").
- **Sending** (`server/src/push/`): the start route hands the call over without waiting
  (`wentLive`, `server/src/app.js`), so a slow or failing push service never delays or fails
  the start. The library `web-push` (3.6.7, MPL-2.0, pinned) signs each message with the
  site's VAPID keys and encrypts it for the device; Node's `fetch` delivers it, at most 8 at
  once (`sendInFlight`, `server/src/push/config.js`; the others wait their turn), all of it
  after the start's request has its answer (decided 2026-11-13). A message lives 15 minutes at
  the push service; a subscription it answers 404 or 410 for is dropped.
- **Who gets it**: every subscribed device of an unlocked account (calls are shown to
  everyone). Locking an account removes its subscriptions (unlocking does not bring them back);
  deleting it takes them with it.
- **What is stored** (`push_subscriptions`): per account and device the browser's push
  address, its two keys and which site key it was made for (one made for other keys, after a
  restore onto a server with new ones, is dropped, never sent to), and when it was last used
  (`used_at`: turned on, checked by its device's account page, or a message delivered). **At
  most 10 devices per account** (`MAX_PER_ACCOUNT`, `server/src/push/store.js`; decided
  2026-11-13): an 11th replaces the one used least recently, so no account makes a call start
  send more than 10 messages. The push address lies at the
  browser maker's push service (Google, Mozilla, Apple, Microsoft), which carries the encrypted
  message; only those services are accepted as addresses, so no member can make the site call
  an address of their choosing. The privacy page says this for members, with every way a
  device's entry is removed (`server/src/info/seed/privacy.md`, "Notifications when a call
  starts", and the account deletion list; 2026-11-13).
- **Routes** (`/api/push`, members only, one limit per account, 30 a minute): `GET /` (the
  public key, null while off), `POST /status`, `POST /subscriptions`, `DELETE /subscriptions`
  (the device's address in the body, so it is in no log line).
- **Keys**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` in `site.env`, made once by the installer
  (docs/DEPLOYMENT.md, "Web push"). Without them push is off.
- **Trying it**: push needs a secure page: the live site (https), or `http://localhost` on the
  computer running the site. On a phone, the site over plain `http://<PC address>` cannot
  subscribe; on an iPhone, only after the site was added to the home screen (Safari's rule).
- Tests: `server/test/push.test.js`, `client/src/notify/pushSwitch.test.jsx`,
  `client/e2e/push.spec.js`, `deploy/test/push.test.sh`.

## Recording

Call recording, video and audio (decided 2026-10-22). It is **off unless set up**:
`CALLS_RECORDINGS_DIR` names the folder the recordings land in (in production
`/data/media/recordings`, so backups include them), and LiveKit's egress service writes there
(docs/DEPLOYMENT.md, "Call recording"). Without it the button is hidden and the routes answer
`404 recording_off`.

- **How**: LiveKit Egress, room composite to an MP4 file (`server/src/calls/service.js`,
  `startRecording` / `stopRecording`).
  - **Encoding**: 1280 x 720, 15 frames a second; H.264 (Main) with the video bitrate capped at
    1,000 kbit/s; AAC at 64 kbit/s, 48 kHz.
  - **Layout**: LiveKit's `speaker` layout shows a shared screen or a camera large when there
    is one, and the speakers' tiles otherwise. A call without video gives a mostly still
    picture and stays small.
  - **Stereo, about 64 kbit/s** (decided 2026-10-22): recordings stay stereo. LiveKit's
    encoding options have no channel setting, so mono cannot be set (measured: stereo).
  - **The egress writes** to `CALLS_EGRESS_OUTPUT_DIR` (its own mount of the same folder; the
    same path when unset). The file is named `call-<id>-<time>-<random>.mp4`. Egress writes
    no `EG_<id>.json` manifest beside it any more (`disableManifest` on the file output,
    `service.js`; egress v1.15.0 has no service-wide switch, `pkg/config/manifest.go:85-96`);
    manifests written before 2026-11-07 stay in the folder.
  - **The folder** (decided 2026-11-06): owner uid 1000, group 0, mode 2775. The egress image
    (v1.15.0) runs as uid 1001 with group 0 and writes its files 644; the site's user (uid 1000)
    reads them and deletes them, which needs write on the folder; setgid keeps group 0 on what
    lands there. The installer sets this on every run (`prepare_recordings_dir`,
    `deploy/install/lib/services.sh`). Before, the folder was 755 1000:1000: egress recorded
    and then failed at the stop with "Local upload failed: … permission denied", and no file was
    kept. The owner's PC test of 2026-10-22 did not show it: Docker Desktop's folders ignore
    these permissions.
  - **Memory**: the egress container may use 3 GB; one recording peaked at 1.79 GB on the VPS
    (egress's "maxMemory", 2026-11-06).
- **Chrome's start** (decided 2026-11-09; owner's rule: a recording really records at most
  10 s after the request): egress records the room in its own Chrome, and egress waits 20 s for
  Chrome's DevTools address (chromedp v0.16.0 `allocate.go:40`, `:249-250`), then fails with
  "page load error: websocket url timeout reached" (live 2026-11-09). Chrome's own fontconfig
  cannot use the image's prebuilt font cache, so the first Chrome in a newly made container
  writes `~/.cache/fontconfig` (4.7 MB) before it answers: 4.7–8.5 s instead of 1.2–2.0 s on the
  PC, and past 20 s on the VPS after an update. So `~/.cache` is the volume `egress-cache`, kept
  across container changes, and the one-shot service `egress-cache` fills it with one headless
  Chrome before egress starts (`deploy/calls/docker-compose.recording.yml`). Measured on the PC
  (15 starts each: 3 in a newly made container, 4 after 1–5 min idle, 8 back-to-back; time to
  active): before, 12 of 15 within 10 s (5.2–14.5 s); with the cache, 15 of 15 (5.1–7.4 s); with
  the volume new and filled first, as after a first install, 15 of 15 (5.1–7.6 s). About 3.4 s of
  every start is egress's own pipeline latency after START_RECORDING
  (`pkg/config/service.go:52`; it cannot go below about 2.3 s, measured 2026-11-07).
- **CPU** (decided 2026-11-06): the egress container is limited to 3 CPUs and counts a
  recording at 2.0 of them (`cpu_cost.room_composite_cpu_cost` in
  `deploy/calls/docker-compose.recording.yml`). Egress v1.15.0 takes a job only when that cost
  fits its free CPUs, read from the container's limit: all of them while idle, 80 % minus what
  runs once a job runs. So one recording at a time; a second one started meanwhile is declined.
  Its default cost (4) is more than the earlier 2-CPU limit, so every start went unanswered.
- **When the egress does not answer**: the start request gives up after 8 seconds (the egress
  client's `requestTimeout`, `service.js`) and the site answers `503 recording_unavailable`,
  "The recording service did not answer. Try again in a minute."; nothing is stored.
- **Allowed** (2026-10-23): the "Recording allowed" setting (on by default, docs/SETTINGS.md); off,
  no new recording starts and the button goes, while a running one can still be stopped and
  stored recordings stay.
- **Who**: only organisers and admins start and stop the recording of a live call
  (`POST /api/calls/:id/recording/start|stop`, audited `call.recording_start|stop`). One
  recording per call at a time. Ending the call stops it (`endCall.js`).
- **Starting, then recording** (decided 2026-11-07): live, the egress took about 20 s from the
  start request to its first frame, while the site already said "Recording". Now a started
  recording is **starting** until the egress reports it active, then **active**:
  - **Polling, not webhooks**: `server/src/calls/recordingStart.js` asks the egress
    (`service.listEgress`) at once and then every 2 s. Active: the row gets `active_at` and
    every client is told (the room's metadata, `roomState.js`: `recording`, `recordingState`,
    `recordingFailedAt`). Failed, aborted or ended, or not active within **60 s**: the egress is
    stopped if it still runs, the row goes (there is no file) and the call keeps
    `recording_failed_at`; organisers see "The recording did not start. Try again." while nothing
    records, until the next start clears it. After a restart the calls job watches a starting
    recording again (the 60 s count from its start).
  - **Stopping while it starts** is allowed: the egress stops and the row goes, without that
    message. Ending the call does the same.
- **Record from the start** (decided 2026-11-07): a checkbox in the "New call" form, off by
  default and shown only while recording is set up and allowed (the list's
  `recordingEnabled`); stored per call (`calls.record_from_start`). Starting such a call (the
  card's "Start", or "Start call now") starts its recording right away, through the same
  `startCallRecording` (`recordingStart.js`) as the button, audited `call.recording_start`.
  - **Why at the start**: the egress's room composite template waits for media before it
    records (egress v1.15.0 `template-default/src/Room.tsx:66-110`: decoded video frames, or
    sound after 0.5 s); the egress itself waits for that signal without a time limit
    (`pkg/pipeline/controller.go:292-301`). So it records once someone speaks.
  - **Waiting, not starting**: its state is **waiting** ("Recording starts when someone
    speaks…"), with no 60 s rule. If the room closes first (LiveKit's empty timeout, the egress
    then ends it) or the call ends, it is stopped and its row goes, without the failure message.
    Any other end is a real failure and shows "The recording did not start. Try again." as for
    the button: the egress failing, or aborting while the call runs and its room is still there
    (egress reports a closed room as aborted too, so the site checks the call and the room,
    `callOver` in `recordingStart.js`; fixed 2026-11-09, seen live: a failed start had vanished
    without a word).
  - **If it cannot start** (the egress does not answer), the call still runs; the organisers
    see "The recording did not start. Try again." as for the button.
  - **The words**: "Recording starts…" while starting (the red mark in the call, its banner,
    "· Recording starts…" beside it and on the Calls page), then "Recording" / "This call is now
    being recorded" / "Being recorded" as before (`client/src/calls/recordingLabel.js`).
    Joining asks for consent from the start already. Someone outside the call sees it change
    within 5 s (the page asks again while it starts).
- **Notice, always**:
  - **The room's metadata says it runs** (`roomState.js`, together with the spotlight), so
    everyone in the call sees a red **Recording** beside the title.
  - **The start**: when a recording starts, everyone already in the call gets the banner "This
    call is now being recorded".
  - **Joining**: while a recording runs, anyone joining — listener or speaker — must first
    confirm "I understand this call is being recorded" (`RecordingConsent.jsx`). The server
    gives no token without it (`409 recording_consent` on `POST /api/calls/:id/join` until the
    body says `recordingConsent: true`), so without the yes nobody connects.
  - **Sending**: someone who joined before the recording started is asked the same before
    turning on their microphone, camera or a screen share, for example when moved onto the
    stage (`useCallRoom.js`).
  - **"Being recorded"**: the Calls page and the call's page say it on a call while its
    recording runs.
- **Afterwards**: the call's page lists its recordings with date, length and a player
  (`CallRecordings.jsx`), for the same audience as the call (calls are shown to everyone):
  `GET /api/calls/:id/recordings` and `…/recordings/:rid/video` (range requests, so the player
  can seek; only finished recordings).
  - **The length** is the file's own, read from the MP4's movie header (`mp4Duration.js`,
    which reads only box headers, never the media) once the file is complete, and then kept
    (`call_recordings.seconds`). It is never computed from the start and stop times, which
    include the egress's start-up (a 33-second file once showed as 0:36). While it is unknown
    (the file not complete, or not an MP4), no length is shown rather than a wrong one.
  - **Deleting**: organisers and admins delete a recording, file and row
    (`DELETE /api/calls/:id/recordings/:rid`, audited `call.recording_delete`). Nothing is
    deleted automatically.
  - **Chapters** (2026-10-23): marks under the player, each a time and a title; a click seeks
    the player there (`RecordingChapters.jsx`). Organisers and admins add, change and delete
    them (`POST`, `PUT`, `DELETE /api/calls/:id/recordings/:rid/chapters[/:cid]`, audited
    `call.chapter_add|edit|delete`; `chapterRoutes.js`): the time as m:ss or h:mm:ss within
    the recording (its length read from the file if nobody has listed it yet), a title of at
    most 80 characters (`shared/chapterRules.js`, the same check in the form and on the
    server). Stored on this site (`call_recording_chapters`), gone with their recording.
- **The archive** (2026-10-23): `/calls/recordings` (`RecordingsPage.jsx`), linked from the
  Calls page ("All recordings") and the weekly recap: every finished recording for the calls'
  audience (everyone), newest first, each with its call's title (a link to the call), date,
  length, player and chapters, and a search over the call titles
  (`GET /api/calls/recordings`, mounted before the call routes, whose `/:id` would take it).
  The call page, the archive and a recording's own page show a recording the same way
  (`RecordingItem.jsx`, `recordings.css`).
- **Sharing a recording** (decided 2026-11-10: recordings stay public, each with a stable link
  that shows a preview card where it is posted, on Discord, Telegram, X and the like):
  - **The link** is `/recordings/<id>` (the recording's own id, never reused; the call's page
    `/calls/<id>` keeps working). Its page (`pages/RecordingPage.jsx`) shows only that
    recording for everyone: the call's title, a link to the call and to the archive, then the
    recording as in a list. A recording that does not exist (or no longer) shows "Page not
    found"; after an organiser or admin deletes it there, the page goes to the archive. The
    page reads `GET /api/calls/recordings/:rid` (the recording with its call).
  - **The preview card**: the server answers `/recordings/<id>` with the client's `index.html`
    plus meta tags (`server/src/calls/recordingShare.js`): `og:title` (the call's title,
    "(recording)"), `og:description` (the date in UTC, labelled "UTC": `UTC_ZONE` in
    `shared/localWeek.js`, as the weekly recap's text, since one card is read in every zone
    (decided 2026-11-11); and the length), `og:url`, `og:type`
    `video.other`, `og:image` (the site's logo, `/brand/logo.webp`), `og:video` and
    `og:video:secure_url` (the public video URL), `og:video:type` `video/mp4`,
    `og:video:width`/`height` (1280 x 720, the recording's size), and `twitter:card`
    `summary_large_image` (a "player" card would need an embeddable player page of its own).
    Every value is HTML-escaped and put in as text (a `$'` or `$&` in a title is never a
    replacement pattern, 2026-11-13); the page's `<title>` becomes the recording's. A missing,
    deleted or unfinished recording answers 404 with the plain `index.html`. Each answer reads
    that file and the database, so the page counts against the reads per IP of `/api`
    (`API_READS_PER_MINUTE`, docs/AUTH.md; since 2026-11-11, after a CodeQL finding). Only where the
    built client is served (production, the browser tests); the Vite dev server answers
    without the tags. The URLs use `PUBLIC_ORIGIN`. Nothing new is loaded from elsewhere: the
    CSP and the embed rules are unchanged.
  - **"Share"** on every recording (`calls/ShareRecording.jsx`, in `RecordingItem.jsx`): on a
    touch screen with a share sheet (`navigator.share`) the sheet opens with the link; elsewhere
    the link is copied and "Link copied" shows. Without a clipboard the link is shown to copy
    by hand.
  - Tests: `server/test/recordingShare.test.js`, `client/src/calls/recordingShare.test.jsx`,
    `client/e2e/recordingShare.spec.js` (the browser tests run with `CALLS_RECORDINGS_DIR` set;
    no egress runs there, so the spec stores its recording in the database).
- **Tested for real on the owner's PC** (2026-10-22): LiveKit v1.13.10 with egress v1.15.0 and
  Redis in Docker. A browser with a fake camera and microphone was recorded through the
  site's own service code: a playable MP4, 1280 x 720, 15 frames a second, H.264 Main at about
  530 kbit/s, AAC 64 kbit/s. An empty room does not record: the egress aborts with "Start
  signal not received".
- Tests: `server/test/callRecording.test.js` (with the stand-in call service, which writes a
  file when a recording stops and reports each one's egress state),
  `server/test/recordingStart.test.js` (starting → active, failed, 60 s, stop while starting,
  restart), `server/test/recordingArchive.test.js`,
  `server/test/callsConfig.test.js`, `shared/chapterRules.test.js`,
  `client/src/calls/callRecording.test.jsx`, `client/src/calls/recordingsArchive.test.jsx`.

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

| Port        | Protocol | Open to  | What                                                                                  |
| ----------- | -------- | -------- | ------------------------------------------------------------------------------------- |
| 443         | TCP      | everyone | the reverse proxy: `wss://<calls domain>` → `127.0.0.1:7880`                          |
| 7880        | TCP      | nobody   | signalling and API; only the reverse proxy reaches it (nginx mode: on 127.0.0.1 only) |
| 7881        | TCP      | everyone | media over TCP (ICE), for clients whose UDP is blocked                                |
| 50000–50499 | UDP      | everyone | media (500 ports: 250 participants × 2 peer connections)                              |
| 3478        | UDP      | everyone | TURN over UDP                                                                         |
| 5349        | TCP      | everyone | TURN over TLS                                                                         |

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

### Load test

`deploy/calls/loadtest.sh` measures what the call service on the VPS carries (built 2026-11-10;
run by the owner, never by CI): `sudo ./deploy/calls/loadtest.sh` in the checkout.

- **Steps**, 3 minutes each: 3 video publishers (2 cameras and a screen share: LiveKit's CLI has
  no screen share, so it is a third video publisher at high resolution) and 2 audio publishers,
  with 25, then 50, then 100 subscribers. The load comes from LiveKit's CLI (`lk load-test`,
  livekit-cli 2.19.3 pinned by digest) on the host network against `ws://127.0.0.1:7880`, in a
  container capped at 2 CPUs and 2 GB.
- **Measured** every 10 s: the CPU of LiveKit, egress and the site (`docker stats`), the 1-minute
  load and the free memory. At the end a table per step: LiveKit's CPU peak and average,
  egress's and the site's peaks, the highest load, the lowest free memory, and from the CLI the
  tracks subscribed, the packet loss and the failed subscribers. The full log is
  `/var/log/se-loadtest-<time>.log`.
- **Safety**: it stops at once when the load passes 5, the free memory drops under 1.5 GB, on
  Ctrl-C, or after 20 minutes in all. Its containers are `--rm` and only its own
  (`se-loadtest-*`); its rooms are deleted after; the keys come from `deploy/calls/.env` through
  a temporary file and are never printed. Nothing else on the server is touched (the bots keep
  running).
- **Pessimistic**: the load generator shares the host with LiveKit, so real participants on
  their own machines cost the server less than these numbers show.
- `--dry-run` prints the plan without starting anything; `deploy/test/loadtest.test.sh` checks
  it (CI too). The script is executable in git (`deploy/test/executable.test.sh`).

**Measured live on 2026-11-10** (the VPS, master c9980a7; 3 video + 2 audio publishers; the
generator on the same host, capped at 2 CPUs and 2 GB):

| Subscribers | LiveKit CPU avg / peak | Host load max | Free memory min | Tracks  | Packet loss | Errors |
| ----------- | ---------------------- | ------------- | --------------- | ------- | ----------- | ------ |
| 25          | 85 % / 156 %           | 3.48          | 10378 MB        | 125/125 | 0.001 %     | 0      |
| 50          | 111 % / 177 %          | 3.74          | 10117 MB        | 250/250 | 0.112 %     | 0      |
| 100         | 163 % / 208 %          | 4.22          | 9541 MB         | 500/500 | 0.47 %      | 0      |

Every track arrived in every step and no subscriber failed; the load stayed under the stop
limit of 5 at 100 subscribers. Not measured: the internet uplink (the test runs over loopback
only), so the server's outgoing bandwidth is the open question for large calls.

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
put the three keys in `.env`). `CALLS_DEV_PORT` moves it off 7880 (the browser tests run their
own on 7890).

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
