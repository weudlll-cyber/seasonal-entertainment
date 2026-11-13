# Backlog

An entry moves from part one to part two only when its branch is merged into `master`.

## PART ONE — open

Checked against the code by the project audit of 2026-10-23 (SE-AUDIT-1); grouped by what each
entry waits for.

### Needs the owner's decision

- **Real sites to approve for the chat embed** — which game sites go on Admin → Embedding once
  the site is live (only exact `https://` origins).

### Built, waiting for the merge

- **An ended call's chat column without a blank box** — built on `night/2026-11-13` (piece 1;
  seen 2026-11-13 as an empty white box with only its title): the column says "This call's chat
  is closed." and, without messages, "No messages in this call." inside its box; with messages
  it shows them read-only (docs/CALLS.md, "Call chat").
- **The login keeps the whole link** — built on `night/2026-11-13` (piece 2; the `?query` was
  dropped on the way, noted 2026-11-13): a page for members, and the "Sign in" of the
  sign-in-ended notice, hand the login the path, `?query` and `#anchor` (`herePath`,
  `client/src/session/nextPage.js`); still only paths on this site. The account page's Discord
  section comes back to `/account#discord` (docs/AUTH.md, "Sessions" and "Discord").
- **The encrypted backup scripts' test under load** — built on `night/2026-11-13` (piece 3; it
  timed out at 45 s twice in a full verify): measured, its time is four fresh node processes of
  the real scripts (10–20 s alone, up to 56 s beside the full server suite), not its data; it has
  a timeout of its own, 120 s (`server/test/backupEncrypted.test.js`).

### To try on the live server

- **Trial restore of a live backup** — never done on the live site yet (decided 2026-11-03):
  restore one nightly backup there once, as docs/DEPLOYMENT.md describes, and check the site.

### Proposals not decided

- **A frame of the video as a recording's preview image** — the share card uses the site's logo
  (2026-11-10); a picture taken from the recording itself would need new image tooling on the
  server (an idea, not planned).
- **Group roles from Telegram** — steps or rooms tied to Telegram groups are not built (Telegram
  login is not planned, decided 2026-11-02).
- **Each vote reloads the poll summary on every member's open page** — security review of
  2026-11-13, L4 (left for now, decided 2026-11-13): every vote tells every member's page, and
  the sidebar then reads `GET /api/polls/summary`, which goes through every poll ever made. An
  idea: tell the pages at most once a second, read only open polls for the summary, and page
  the archive.
- **Race-game connection** — the website's part is done (PR #64, 2026-11-11: the slug `race`,
  its routes, room and installer question). Open: the race's own side, in its own repository;
  then, once it is live, `RACE=yes` on the server and the /games card "Seasonal Race" switched
  from "coming soon" to available.

### Known limits

- **Only the owner's own games are embedded** — if a game not run by the owner is ever embedded,
  revisit proposals C (keep the website's cookies from it: a separate origin), D (per-game
  capabilities beyond hosting) and E (a sync token per game) of docs/PROJECT-LEAD-REVIEW.md. Not
  needed while both games are the owner's own on the same server (decided 2026-11-09).
- **A call recorded from its start blocks a second recording meanwhile** — while it waits for
  its first speaker, the egress keeps its Chrome and its 2.0-CPU share, so a recording started in
  a second call at the same time is declined ("did not start"). Accepted by the owner on
  2026-11-07; listed only (docs/CALLS.md, "Recording").
- **A restore does not revoke Discord tokens** — analysed by SE-AUDIT-2 (2026-11-04), kept: a
  restore deletes an account deleted after the backup again, its Discord link with it, and
  revokes nothing. The token in the backup is dead already: the deletion revoked that grant, and
  revoking ends the whole grant, older tokens included (docs/AUTH.md, "Discord: grants not
  kept"). Only a deletion whose one best-effort revocation failed (Discord unreachable) leaves a
  grant alive, restore or not. Revoking at the next start instead would mostly send a token
  Discord rotated out since the backup, and would end the grant of an account that has linked
  the same Discord user since; so the restore stays as it is.
- **A lost refresh token** — narrowed by SE-AUDIT-2 (2026-11-04): the new token used to be saved
  only after the member read, a second call to Discord; it is now saved the moment Discord gives
  it (`keepRefreshToken`, `server/src/discord/refresh.js`). Only a stop between Discord's answer
  and that one statement still loses it (the member then logs in with Discord again): the token
  exists only in that answer, and the old one is dead by then, so no ordering closes the gap
  (docs/AUTH.md, "Discord: steps and the daily read").
- **`devProxy.spec.js` failed once in a full verify** (2026-11-03): the guest's message never
  showed in General through the Vite dev proxy (20 s), and the spec passed alone. Not reproduced
  by SE-AUDIT-2 (2026-11-04): 5 runs alone, 5 next to the full server suite, and one with Vite's
  dependency cache cleared (a dependency reload of the open page was the suspect; none was
  logged). A guest's message enters the list from the POST answer (`useChatRoom.js`), so no
  list race was found either. Not reproduced on `night/2026-11-10` either (piece 10,
  2026-11-09): 10 runs, each with its own fresh servers (so the 5 registrations an hour never
  bind), 5 alone (26–32 s) and 5 started next to the full server suite (the first took 2.0 min
  and the second 52 s while the suite ran; the suite ended during the second, so the last three
  ran at 29–31 s on a quiet machine). All passed; the code stays as it is.

## PART TWO — closed

- **Voters' names in polls only for signed-in members, and polls on the privacy page** — closed
  on `night/2026-11-13` (security review of 2026-11-13, M2; decided 2026-11-13; not merged
  yet): in a poll that is not anonymous the names per answer go to signed-in members only;
  guests get the counts, in every answer with results (`resultsOf`,
  `server/src/polls/store.js`). The vote form and the home box say members see the name. The
  privacy page's new "Polls" entry says who sees what, that an anonymous poll's link between
  ballot and account lasts only while it is open (and in the backups taken meanwhile until they
  are deleted), and what an account's deletion takes; an unedited privacy page gets the new
  text (`earlier-seeds.json`). docs/POLLS.md.
- **A short account page** — closed by `feat/account-sections` (PR #69, merged
  2026-11-13; decided 2026-11-13): a summary (username, role as the sidebar shows it, email)
  with "Log out", then six collapsible sections, all closed by default (Profile; Sign-in &
  security; Private messages; Privacy; Notifications; Delete my account, set apart), each closed
  heading with a short status the page already knows; several open at once, remembered in the
  browser; every link to a section or a part of one opens it, and a waiting notice (two-factor
  required, a Discord answer, a push failure) opens its section. With every section closed it
  fits a desktop window from 1000px wide. Only the arrangement changed (docs/DESIGN.md, "Account
  page").
- **A sign-in that ended on the server** — closed by `fix/session-ended` (PR #68, merged
  2026-11-13): the first `401 not_authenticated` while the page shows a member, or coming back
  to the site's tab or window when the server says nobody is signed in (decided 2026-11-13),
  drops the member once, says "Your sign-in has ended. Please sign in again." and leads to the
  login page, which returns to the page afterwards (docs/AUTH.md, "Sessions"). Seen 2026-11-12
  as "Please log in." when unlocking private messages; on pages with only public data the
  notice had come only after several clicks.
- **Installable site and a "call started" web push** — closed by `feat/push-call-started`
  (PR #67, merged 2026-11-13; decided 2026-11-10; replaces "Notifications when the browser is
  closed (web push) — not built" of 2026-10-22): a web app manifest with icons from the emblem
  and a service worker that caches nothing; one push only, "<call title> has started" when a
  call goes live, to members who turned "When a call starts" on for a device (account page,
  Notifications), on at once with the rest finished in the background and never a silent
  failure; VAPID keys made once by the installer; the privacy page says what is stored per
  device (docs/CALLS.md, "Push when a call starts"; docs/DEPLOYMENT.md, "Web push").
- **Member profile pages** — closed by `feat/member-profiles` (PR #66, merged 2026-11-12;
  decided 2026-11-11): `/members/<name>` for signed-in members (name, role, Discord steps,
  member since, About me up to 300 characters as plain text, a picture by the chat images'
  rules), edited on the account page, reached from a chat name's menu, the member search and the
  names in a call; "Send message"; admins clear About me and the picture (audited); the privacy
  page says what a profile shows (docs/AUTH.md, "Member profiles").
- **The chat composer at phone width** — closed by `fix/composer-narrow` (PR #65, merged
  2026-11-11): at 360px "Emoji, stickers, GIFs" overlapped "Attach file" on the /chat page, in
  rooms and in direct messages. Below 600px the full composer's buttons now wrap onto more
  lines, the picker on a line of its own; the whole composer stays inside the chat card, its
  room taken from the message list (at least 8rem), and a window too short for that scrolls the
  page; desktop unchanged (docs/DESIGN.md, "Compact chat composer";
  `client/e2e/composerNarrow.spec.js`).
- **The race as the third embedded game, the website's part** — closed by `feat/race-slug`
  (PR #64, merged 2026-11-11; decided 2026-11-11): `race` (Seasonal Race) in the allowlist, so
  `/api/games/race/authorize`, `/api/games/race/account-changes`, its "May host" box and the
  games list follow; the seeded "Seasonal Race" room is the race's room under the slug `race`
  (one race room; older databases rename `seasonal-race` once, keeping everything; its rules
  stay members read and write); the installer's `RACE` question (default no), `--race` and its
  `--update` pass-through; the race's feed denied by nginx and Caddy. The /games card stays
  "coming soon"; nothing visible changes while the race is off (docs/GAME-INTEGRATION.md,
  docs/AUTH.md, "Embedded games", docs/EMBED.md).
- **Polls** — closed by `feat/polls` (PR #63, merged 2026-11-11; decided 2026-11-10): `/polls`
  for everyone; organisers and admins create (fixed answers or free text, results after the
  vote or after the end, anonymous or not, a fixed end or by hand), end early, extend; members
  vote once (changeable until the end where results come after the end); written answers only
  for organisers and admins; admins delete; audited; live for members over the chat
  connection, every minute for guests. Piece 3: who may vote (all members, Discord steps with
  the chat rooms' step rule, or organisers and admins only), the home page's Poll box and the
  dot on "Polls". Piece 4: polls started in a live call, under its stage with a countdown (1, 2
  or 5 minutes or by hand), ended with the call. Follow-ups of 2026-11-11: newest first,
  anonymous votes changeable too (ballot links only while open), the results rule shown, polls
  in chat rooms (a card in the timeline, the room's read rules), every view comfortable on a
  phone (docs/POLLS.md).
- **Dependency updates by Renovate** — closed by `chore/renovate` (PR #61, merged 2026-11-11 as
  ab07274; 2026-11-10): `renovate.json`
  as in the game repositories (weekly grouped minor/patch, 3 days' wait, security at once),
  covering npm, the actions, the images in `deploy/`, the CI's scanner images and the LiveKit
  binary (docs/DEPLOYMENT.md, "Dependency updates"). Renovate's onboarding PR is left alone.
- **Recordings backed up once each** — closed by `feat/backup-recordings` (PR #60, merged
  2026-11-11 as 0c273d0; decided 2026-11-11): the nightly archive leaves the call recordings out; each finished recording is
  encrypted once into the backup folder's `recordings/` (again only when it changed), kept 14
  days after it was deleted on the site; the PC scripts fetch only what they do not have (by
  name and size) and never delete; a restore takes `--recordings` and names every missing one
  (docs/DEPLOYMENT.md, "Backups", "Restoring"). Fixed with it (2026-11-11): the Windows module
  failed with "You cannot call a method on a null-valued expression" whenever the server held
  no archive (a fresh install before its first night, or only `recordings/`), because an empty
  name list reached `Select-BackupNames` as `$null`; it now logs "0 backups" and goes on. Also
  fixed with it: the installer took the newest entry of the backup folder by time (`ls -t`),
  which after a night with a recording is `recordings/`, so an install or `--update` would have
  stopped with "the newest backup is not an encrypted .tar.age" and `--status` named the folder;
  `newest_backup` and `backup_count` (`deploy/install/lib/common.sh`) count only the archives.
  The CI backup check picks the archive by name the same way (it failed on this pull request).
- **The "Start here" browser test failed now and then** — closed on `feat/backup-recordings`
  (2026-11-11): it read the steps' addresses once, and the call step's changes from `/calls` to
  `/calls/<id>` when the recording-share spec plans a call on the shared test server
  meanwhile; it now clicks each step by position and accepts either call address
  (`client/e2e/start.spec.js`). Seen in two of four local runs, never on CI.
- **A share link per recording** — closed by `feat/recording-share` (PR #59, merged 2026-11-11 as
  2b8a695; decided 2026-11-10):
  `/recordings/<id>` shows only that recording; the server adds the preview card's Open Graph
  and Twitter tags (the logo as the image, the video as `og:video`); "Share" on every recording
  copies the link or opens the phone's share sheet (docs/CALLS.md, "Sharing a recording"). The
  card's date, like every time in the weekly recap's text, is in UTC, labelled "UTC" (`UTC_ZONE`
  in `shared/localWeek.js`; decided 2026-11-11: texts the server writes for many readers at once
  use UTC; pages keep each viewer's own device time zone). The recap's posting weekday and hour
  stay in Vienna time. The share page counts against the reads per IP of `/api` (CodeQL's
  "Missing rate limiting" on the pull request, 2026-11-11).
- **CI security scans** — closed by `chore/ci-security` (2026-11-10): the CI job "security"
  runs gitleaks over the full history, `npm audit` of the production dependencies (high or
  critical fails) and osv-scanner on `package-lock.json` (CVSS 7 or more fails); the workflow
  "CodeQL" scans the JavaScript on pushes, pull requests and weekly, as the game repositories
  do. The 8 findings in the history were checked one by one (an e2e-only key, the public guild
  id, test user ids, RFC 6455's sample key) and are accepted by fingerprint in
  `.gitleaksignore`. `deploy/calls/loadtest.sh` is executable in git now (it failed live with
  "command not found"); `deploy/test/executable.test.sh` checks every script started directly.
- **A call load test for the VPS** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 5), run live on 2026-11-10 (master c9980a7):
  with 3 video and 2 audio publishers and 25, 50 and 100 subscribers LiveKit used 85, 111 and
  163 % CPU on average (peaks 156, 177 and 208 %), the host load peaked at 3.48, 3.74 and 4.22,
  at least 9541 MB stayed free, every track arrived (125, 250 and 500), packet loss was 0.001,
  0.112 and 0.47 %, no errors. The internet uplink was not measured (loopback only)
  (docs/CALLS.md, "Load test").
- **A held Discord sign-up timing out while it is being completed** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 9;
  SE-AUDIT-2): the registration claims its sign-up from the session row inside the transaction
  that stores the link (`claimSignup`, `server/src/discord/droppedGrants.js`), the row the sweep
  takes it from; either the account starts with a live grant, or the answer is
  `signup_expired` ("start again").
- **Unread counts after an account deletion** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 8; SE-AUDIT-2): every reader of
  each room is told to recount, also on pages not showing the room
  (`server/src/chat/accountData.js`; docs/AUTH.md, "Deleting an account").
- **One source per game-integration fact** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 7): docs/GAME-INTEGRATION.md keeps the
  overview, the game's requirements, the task brief and the checklist and links to AUTH, EMBED,
  DEPLOYMENT and OPEN-ROUNDS for the contracts, marking what is current, built, requested or
  proposed.
- **The development dependency advisories** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 6): `npm audit` is clean;
  `minimatch` is overridden to `^11.0.5` for ESLint's `@eslint/config-array` (docs/ARCHITECTURE.md,
  "Stack").
- **A password change or reset ends game sessions** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 2; decided 2026-11-09): a
  member's own change and an admin's reset are noted for the games as "rights"; not the first
  password of a Discord account (docs/AUTH.md).
- **Hosting per game** — closed by `night/2026-11-10` (PR #55, merged 2026-11-10 as c9980a7) (piece 1; decided 2026-11-09): an admin grants hosting per
  embedded game (Admin → Users); admins always may; `X-Acting-User-Can-Host` answers for the
  game asking; the old flag `users.can_start_games` became a grant for every game of each
  account that had it (`server/src/accounts/gameHosts.js`; docs/AUTH.md, "Embedded games").
- **The "May host" boxes in Admin → Users ran together** — closed by `fix/host-boxes-layout`
  (PR #56, merged 2026-11-10 as 88153a7): the game names stood in one run with each box above its name, because every
  game used the centred one-box style of a table cell. Now one game per line, the box beside its
  name, the whole line the 44px target (the site's `form-check`); a name stays on its line and
  the table scrolls sideways on a narrow screen (`client/src/admin/UserRow.jsx`, `admin.css`).
- **Site and bots on the same VPS** — closed (2026-11-09): the site and the owner's bots run on
  the same server, and the installer reads the bots' files there through read-only mounts
  (docs/DEPLOYMENT.md, "What it asks").
- **A recorded call on the VPS** — closed (2026-11-09): five recordings live, 4.3–8.8 s from the
  start to active, one of them with sound (mean −28 dB; the others' microphone was off). The
  egress start fix (PR #52) and the recordings folder (PR #48) made it work. LiveKit's "could
  not validate external IP" at start stays described in docs/DEPLOYMENT.md, "Troubleshooting".
- **Call media over UDP from outside** — closed (2026-11-06): the owner joined a live call from
  his home network with camera and screen share.
- **Settings export/import between the PC test site and the live site** — not planned (decided
  2026-11-09): settings are carried over by hand; the Discord steps travel with the project's
  seed (`npm run steps:export`).
- **Starting a call turns the microphone on** — closed by `feat/start-mic-on` (PR #53, merged
  2026-11-09): joined automatically after "Start call now" or "Start <title>", the organiser's
  microphone goes on and the camera stays off; an ordinary join stays all off
  (`client/src/pages/CallPage.jsx`; docs/CALLS.md, "Calls on the site").
- **The call page's rail opened expanded** — closed by `fix/rail-stays-open` (seen live
  2026-11-09): after leaving a call page through a link in the expanded rail, the next call page
  started expanded, as the rail's state outlived the page (the sidebar stays mounted, and the
  pointer never "left"). Now reset whenever the rail turns on or off
  (`client/src/app/useRail.js`; docs/DESIGN.md, "Call page").
- **A recording with silent audio** — closed, no defect (2026-11-09): recording EG_XPnJouKUiaPU
  had an AAC track of digital silence (mean −91.0 dB, N=1). The organiser's laptop microphone
  was switched off with its hardware key (owner's check, 2026-11-09): Chrome's own level meter
  showed no input, LiveKit received the track. The PC had sound in every one of 20 recordings;
  nothing in the site or egress to change.
- **A recording's start took up to 27 s or failed** — closed by `fix/egress-chrome-start` (PR
  #52, merged 2026-11-09; part 1; live 2026-11-09: 20.8 s then "websocket url timeout reached",
  11 s, 27 s; owner's rule: at most 10 s). Cause: the first Chrome in a newly made egress
  container builds its own font cache before it answers. Now kept in the volume `egress-cache`
  and filled by a one-shot service before egress starts; on the PC 15 of 15 starts active within
  7.6 s, against 12 of 15 within 10 s before (`deploy/calls/docker-compose.recording.yml`;
  docs/CALLS.md, "Recording"). Replaces the warm-up proposal of 2026-11-07, which closes: a
  warm-up recording was not needed. Still to confirm on the VPS (two recordings in a row after
  the update).
- **A recording from the start that failed vanished without a word** — closed by
  `fix/egress-chrome-start` (PR #52, merged 2026-11-09; part 2; seen live 2026-11-09): every end
  of a recording started with the call was dropped silently. Now only a call that ended or a room
  that closed before anyone spoke stays silent; an egress that fails, or aborts while the room is
  still there, shows "The recording did not start. Try again."
  (`server/src/calls/recordingStart.js`, `callOver`; docs/CALLS.md, "Recording").
- **Quick call start** — closed by `feat/quick-call-start` (decided 2026-11-06; merged
  2026-11-07 with `feat/recording-start`): an organiser needed four steps before a call ran
  (create, start on the card, open, join). Now "Start call now" in the form (no planned start)
  creates, starts, opens and joins in one click, and "Start <title>" on a card opens and joins;
  once only, never on a reload (`client/src/calls/callIntent.js`; docs/CALLS.md, "Calls on the
  site").
- **An honest recording state** — closed by `feat/recording-start` (night chain, piece 1,
  merged 2026-11-07; found live 2026-11-06/07: the egress records about 20 s after the start
  request, the site said "Recording" from the first second): "Recording starts…" until the
  egress reports it active, polled every 2 s; a start that fails or is not active within 60 s is
  stopped and dropped with "The recording did not start. Try again."; no more `EG_<id>.json`
  manifests (`server/src/calls/recordingStart.js`; docs/CALLS.md, "Recording").
- **Record from the start** — closed by `feat/recording-start` (night chain, piece 2, merged
  2026-11-07): a checkbox in the "New call" form (off by default, only while recording is
  allowed); starting the call starts its recording, which waits for the first speaker
  ("Recording starts when someone speaks…", no 60 s rule) and goes quietly if the room closes
  first (docs/CALLS.md, "Recording").
- **Recordings failed at their end on the VPS: "permission denied"** — closed by
  `fix/recording-dir` (found live 2026-11-06, after PR #47): egress recorded, then could not write
  its file, as the recordings folder was 755 1000:1000 and the egress image's user is uid 1001,
  group 0. Now owner 1000, group 0, mode 2775, set by the installer on every run
  (`prepare_recordings_dir`, `deploy/install/lib/services.sh`; a link there is refused), and
  the egress may use 3 GB (one recording peaked at 1.79 GB). docs/CALLS.md and
  docs/DEPLOYMENT.md, "Recording" and "Call recording".
- **"Start recording" failed on the VPS** — closed by `fix/recording-cpu` (PR #47, merged
  2026-11-06; found live: "Something went wrong on the server.", the site logged an unhandled
  TimeoutError, the egress logged nothing). Egress v1.15.0 takes a recording only when its CPU
  cost (default 4) fits the container's CPUs (2): it declined every one and LiveKit's start hung
  until the SDK gave up.
  Now 3 CPUs and a cost of 2.0 (`deploy/calls/docker-compose.recording.yml`), the egress
  client gives up after 8 seconds, and a start nobody answers is `503 recording_unavailable`
  with a message (`server/src/calls/service.js`, `recordingRoutes.js`; docs/CALLS.md,
  "Recording"). Applied on the VPS by the installer's `--update`; a real recorded call there
  is still to try (part one, "A recorded call on the VPS").
- **After the login a game's page opened inside the app** — closed by `fix/games-next`
  (SE-GAMES-NEXT, merged 2026-11-06; found in the Mini Games rehearsal on master 82e9e30, Bingo
  the same): after the login, the registration or the Discord sign-up a `next` under
  `/games/<slug>/` showed "Page not found" until a reload. Now opened with a full page load that
  replaces the login page in the history (`goToNext`, `client/src/session/nextPage.js`); `/games`
  and every other path stay inside the app (docs/AUTH.md, "Embedded games").
- **Embedded games as a list: Seasonal Mini Games beside Seasonal Bingo Royale** — closed by
  `feat/embedded-games` (SE-EMBEDDED-GAMES; decided 2026-11-04, merged 2026-11-06): one mechanism
  for every embedded game, a fixed list `bingo` and `mini-games` (`server/src/games/embedded.js`,
  `embeddedRoutes.js`): `GET /api/games/<slug>/authorize` and `/account-changes` per game switched
  on (`GAMES_EMBEDDED`; `GAMES_BINGO_EMBEDDED=1` still means bingo), else 404; one feed, one
  token, each game its own cursor. Each game's chat room (`bingo`, `mini-games`) made at the start
  while the game is on, never overwritten or deleted afterwards (`ensureGameRooms`,
  `server/src/chat/seed.js`). The installer asks one question per game (`--bingo`,
  `--mini-games`; `deploy/install/lib/games.sh`) and denies every feed in nginx and Caddy.
  Recorded choices (2026-11-06): a game room an admin deleted comes back on the next start while
  its game is on (docs/EMBED.md, "The embedded games' rooms"); the installer writes
  `GAMES_EMBEDDED` and removes `GAMES_BINGO_EMBEDDED` (docs/DEPLOYMENT.md, "Embedded games").
- **Games' open sign-ups on the website** — closed by `feat/se-open-rounds` (SE-OPEN-ROUNDS,
  decided 2026-11-04): a game's optional sign-up status URL (Admin → Games) is read every minute
  through the guarded fetch and checked against the shared contract (docs/OPEN-ROUNDS.md); the
  home page's Featured game box rotates with open sign-ups first (8 s, holds on hover, keyboard
  focus and tap, a pause button, reduced motion respected), and the games page's cards show
  "Sign-up open" with Join, for everyone (`server/src/games/openRounds.js`, `client/src/games/`).
- **Deleting a call** — closed by `feat/se-calls-delete` (decided 2026-11-04: a technical test
  call leaves nothing visible): admins delete an ended call completely, with its chat, recordings
  and every row and file of it, audited (`DELETE /api/calls/:id`, `server/src/calls/deleteCall.js`,
  `server/src/chat/roomDeletion.js`; "Delete" on the calls list and the call's page; docs/CALLS.md,
  "Deleting a call").
- **Signing in to Seasonal Bingo Royale through the site** — closed by `feat/se-bingo-login`
  (SE-BINGO-LOGIN; decided 2026-11-02 to 2026-11-04): `GET /api/games/bingo/authorize` for the
  game's sign-in through nginx's `auth_request` (member headers with id, name, role, may host and
  Discord steps; `X-Acting-Guest` for everyone else), account ids never issued twice, an
  account-changes feed for the game (deleted, locked, unlocked, rights) over the local port with
  the installer's sync token, and the installer's `--bingo`, routes include, port file and token
  (then `server/src/bingo/routes.js` and `deploy/install/lib/bingo.sh`; since
  `feat/embedded-games` `server/src/games/embeddedRoutes.js` and `deploy/install/lib/games.sh`;
  docs/AUTH.md and docs/DEPLOYMENT.md, "Embedded games").
- **Four points of the security check of 2026-11-04** — closed by decision 2026-11-04:
  - **"Confirm with Discord" needs no click at Discord** (`prompt=none`): a click at Discord each
    time would only annoy; an attacker needs the open session and the victim's click anyway.
  - **Registration says whether a name or email is taken**: names are public in the chat anyway.
  - **`X-Embed-Origin` is the browser's claim**: it cannot be otherwise; the room's guest rules
    and the per-address limits still apply.
  - **`npm audit`: 6 moderate findings in development tools only** (eslint and its
    dependencies): never on the server, and the fix forces breaking upgrades.
- **Server hardening of the SE-AUDIT-2 follow-up** — closed by `chore/se-audit-2` (2026-11-04;
  `deploy/test/server-hardening.test.sh`, docs/DEPLOYMENT.md):
  - **the event bot's admin page** answers with the site's `nosniff`, `Referrer-Policy`,
    `X-Frame-Options SAMEORIGIN` and `frame-ancestors 'self'`, each `always`, the bot's own copies
    hidden; no script or style policy (`deploy/install/lib/bot-admin.sh`);
  - **the installer** stops, before any change, when its checkout or a folder above it is not
    root's or is group- or other-writable (`refuse_unsafe_checkout`, `common.sh`);
  - **LiveKit's 7880** listens on 127.0.0.1 in nginx mode (`--bind`, `LIVEKIT_BIND`); in Caddy
    mode on every address still, since the site's Caddy container reaches it over the Docker
    bridge; the ICE/TCP, TURN and UDP ports unchanged;
  - **logs**: the Discord callback and file links (`?link=`) without their query, nginx and Caddy;
    every other request as before;
  - **the backup folder** is 750, uid 1000 (its writer), group the PC's read-only backup user
    when there is one (not 700: that user reads it for the PC copies); a re-run fixes an old one.
- **The seed texts of Imprint and Privacy said "needs legal review"** — closed by
  `chore/se-audit-2` (SE-AUDIT-2 follow-up): they now open with "Fill in before going live". The
  texts before are recorded in `server/src/info/seed/earlier-seeds.json`, so on its next start a
  site gives only never-edited Imprint and Privacy pages the new text; pages an owner filled in
  stay as they are (`refreshSeedPages`; `server/test/infoSeed.test.js`, both cases).
- **A deletion's Discord revocation fails silently** — closed by `chore/se-audit-2` (SE-AUDIT-2
  follow-up): a failed revocation at an account's deletion now writes one log line,
  `[discord] revoke at deletion failed`, without the token or anything of the account; no retry
  (`revokerFor`, `server/src/discord/index.js`; `server/test/discordKeys.test.js`).
- **Security check of 2026-11-04** — closed by `chore/se-audit-2` (SE-AUDIT-2; an independent
  review of this branch, and one of master `bb8bd16` outside the session, confirmed in the code):
  - compressed request bodies refused (`415`), body-parser 2.4.0 (GHSA-27r3-jxmh-p828;
    `server/src/http/bodies.js`);
  - linking Discord only after "prove it is you", checked at the start and at the callback
    (`POST /api/auth/discord/link`);
  - failed 2FA login codes limited per account too, not only per address;
  - a report's file copy once per reporter and message, never larger than the stored file, at
    most 20 open direct reports per member;
  - the embedded chat's guest token left out of Caddy's logs;
  - one `?next=` rule for server and browser (`shared/localPath.js`, no `/\host`);
  - an animation's frames counted together against the pixel limit;
  - the unencrypted update copy staged inside the container, never in a host folder of uid 1000;
  - link previews refuse IPv4-compatible IPv6 (`::/96`);
  - pictures in direct messages shown again (CSP `img-src blob:`; they stayed empty under the
    real server's headers);
  - a check that could never fail removed (`keys/handover.js`), and docs corrected: the
    recovery code's 148.6 bits, what the new-device code does not prove.

- **A deleted account's messages on pages already open** — closed by `chore/se-audit-2`: after
  the deletion commits, every open page of a room hears `{ type: 'deleted', ids }` through the
  hub's usual push and drops those messages, for moderators too; the Community box asks again
  (`server/src/chat/accountData.js`, `client/src/chat/useChatRoom.js`; docs/AUTH.md, "Deleting
  an account").
- **`directReport.spec.js`: Send stayed disabled** — closed by `chore/se-audit-2` (CI on
  `4c40c79`, attempt 1): "Send private message" switches to the Direct tab by a router
  transition, and until it is drawn General's field still answered to "Message"; the text went
  there and the private composer came up empty. The spec now types into the "Private messages"
  section's own field, which comes once the partner's key is known. A test cause only.
- **The browser tests' `memberPage` and `--repeat-each`** — closed by `chore/se-audit-2`: the
  helper (`client/e2e/members.js`) asked the database before logging in whether the member had a
  key pair; `--repeat-each` runs a file's repeats in parallel workers, so several browsers saw
  none, and all but the one that made it waited for the first-login offer (reproduced: 6 of 10
  repeats of `directReport.spec.js`). It now reads its own browser's `POST /api/keys` answer,
  known before the login page leaves `/login`; 0 of 10 waited. Specs that share one member
  still need `--workers 1` with `--repeat-each` (each spec has its own members by design).
- **Two waits shorter than the work they wait for** — closed by `chore/se-audit-2`, neither
  reproduced in 20 repeats alone and 20 under load: `chatPreviews.test.js` ("a member link gets
  an Open Graph card", 2026-11-02) waited 3 s for a card whose own deadline is 5 s, now 10 s;
  `deviceHandover.test.jsx` ("Reject sends nothing of the key", 2026-11-03) asked for the
  dialog within waitFor's default second, now 8 s like the file's other waits.
- **`speed.spec.js` after PR #39** — no failure in 8 repeats of its 17 tests (3 alone, 5 next to
  the full server suite; `chore/se-audit-2`); its "Fit" entry is closed below.
- **Discord login on the live site** — done on the live server 2026-11-04: installer `--update`
  to `4c40c79` with Discord; Discord login and the steps checked by the owner. The links to the
  terms and the privacy page in Discord's app settings are left to the owner.
- **The phone touch-target test meets another spec's call** — closed by `fix/se-discord-review`
  (PR #39, `2c3bd3e`, `ae8188c`): the failure of 2026-11-03 was the "Next call" title link of
  `callFit.spec.js`'s call "Fit", under 44 px. That link is now a 44 px target whatever the
  title (entry "A short call title on the home page", below), and `speed.spec.js` checks it with
  a fixed answer named "Fit", so another spec's call no longer decides the check.
- **Imprint and Privacy** — closed by decision (2026-11-04): the owner filled in both on the live
  site (Admin → Info pages); a legal review is not wanted for now. A fresh database still seeds
  them as drafts with `[TO BE FILLED BY OWNER]` placeholders (`server/src/info/seed.js`).
- **Twemoji credit for the four Investor icons** — closed by decision (2026-11-04): the owner adds
  the credit to the live Imprint; no code (docs/AUTH.md, "Discord: steps and the daily read").

- **Games card band hides the logo** — closed by `fix/se-games-band` (found 2026-11-03): the
  Seasonal Race card's logo lost its winter-blue quarter on the winter band. The logo now sits on
  a neutral band, and a season image never on its own season's colour
  (`client/src/games/gameBand.js`; docs/DESIGN.md, "Games").
- **A short call title on the home page was a link under 44 px** — closed by
  `fix/se-discord-review` (Discord review of 2026-11-04): the "Next call" title link is a
  `--hit-target` tap target whatever the title's length, the box's look unchanged
  (`client/src/pages/NextCallCard.jsx`, `homeBottomRow.css`). `client/e2e/speed.spec.js` checks it
  with a call named "Fit", and its late-data checks no longer see calls other specs made.
- **A mention in a call's chat linked to the chat page** — closed by `fix/se-discord-review`
  (Discord review of 2026-11-04): its notification now opens the call's page, `/calls/<id>`;
  mentions in other rooms are unchanged (`shared/callRoom.js`,
  `client/src/notify/useSystemNotifications.js`; docs/CHAT.md, "Notifications").
- **The embedded chat said `ready` twice** — closed by `fix/se-discord-review` (Discord review of
  2026-11-04): `ready` now goes once, after the room is chosen, naming the room shown (`null`
  without one) (`client/src/embed/EmbedChatPage.jsx`; docs/EMBED.md, "From the chat").
- **A local copy on every `--update` without backups** — closed by `fix/se-discord-review`
  (Discord review of 2026-11-04): without backups set up, `--update` first copies the database
  and the media with the backup code into `/var/backups/seasonal-update-copies/`, root only, the
  newest three kept, and says where; with backups nothing changes
  (`deploy/install/lib/update-copy.sh`, `deploy/test/update-copy.test.sh`; docs/DEPLOYMENT.md,
  "Updating").
- **Open chat connections after admin step changes** — closed by `fix/se-discord-review`
  (Discord review of 2026-11-04): a room saved, or a step added, edited, reordered or removed,
  re-checks every open socket's rooms at once (`recheckAllRooms` in `server/src/chat/hub.js`):
  rooms lost leave, rooms gained appear (docs/CHAT.md, "Rooms for Discord steps").
- **Discord grants that are dropped** — closed by `fix/se-discord-review` (Discord review of
  2026-11-04): grants not kept are revoked at Discord (already logged in, registration closed, a
  link refused, a held sign-up replaced or timed out, also when the browser never comes back),
  never while an account here holds that Discord user (`server/src/discord/droppedGrants.js`;
  docs/AUTH.md, "Discord: grants not kept").
- **"Icon from link" read up to 2 MB** — closed by `fix/se-discord-review` (Discord review of
  2026-11-04): the transfer is now cut at the icon limit of 256 KB (`images.iconLimit`,
  `server/src/media/icons.js`), with the same answer as an oversized upload
  (`server/src/discord/iconLink.js`; docs/AUTH.md, "Discord: steps and the daily read").
- **Farmer step icons** — closed by decision (2026-11-04): the shipped seed's eight Farmer icons
  are byte for byte the eight Holder icons (`server/src/discord/seed/icons/`), and are meant to
  be. No change.
- **Login with Discord, steps and rooms for steps** — closed by `feat/se-discord` (SE-DISCORD-1,
  decided 2026-11-02): Discord is the primary login (OAuth2 with state and PKCE, scopes
  `identify` and `guilds.members.read` only), username and password stay for people without
  Discord; existing accounts link and unlink. Steps from the Seasonal Tokens server in three
  ladders, mapped by admins (role ids, order, icons), read at every login and once a day with
  strict refresh-token rotation; shown as one badge next to names (variant C); rooms open from a
  chosen step on; steps never grant rights. Accounts without a password protect their
  private-message key with a recovery code or a password. Installer questions, privacy page and
  docs (docs/AUTH.md, docs/CHAT.md, docs/DEPLOYMENT.md).
- **Group roles from Discord** — closed by `feat/se-discord`: Discord roles show as steps and open
  rooms (above); they grant no site rights (decided 2026-11-02).
- **Telegram login and its recovery codes** — closed by decision (2026-11-02): no Telegram login.
  The direction of 2026-10-17 (recovery codes for logins without a password) is built for Discord
  accounts instead.

- **Bot events listed twice** — closed by `fix/se-event-dedupe` (decided 2026-11-02): the event
  bot keeps one occurrence per announcement channel; the site lists an event at one start once,
  with the platforms together per place, canceled only when every copy is, and the lowest copy's
  id plus every copy's, so call links saved before keep working (`server/src/bots/events.js`;
  docs/BOTS.md, docs/CALLS.md). Live data (2026-11-02): 629 occurrences in 308 dates.
- **Unknown names on the owner's server** — done on the server 2026-11-02 (approved change): a
  catch-all `default_server` (`/etc/nginx/sites-available/catch-all.conf`) answers nothing on
  80 (IPv4, IPv6) and 443 (IPv4) instead of the distribution's welcome page, whose link is gone
  (its file stays); IPv6 443 stays with the installer's refusing server. Every named site answered
  exactly as before; the snapshot is in `/root/nginx-snapshots/`. For other servers:
  `deploy/nginx/catch-all.conf` and docs/DEPLOYMENT.md, "Unknown names: a catch-all" (branch
  `docs/se-next-2-backlog`); the installer tests' nginx scenario adds it before `--update`.
- **A call test that sometimes hangs on CI** — closed by `fix/se-small-2`. The cause: the read
  limit of 1200 `GET`s under `/api` per address and minute (since 2026-10-21). Every browser
  test comes from 127.0.0.1; the runs that hung (2026-10-23) went through 102 tests in about 53
  seconds (a run makes about 12.5 reads per test), the call tests ran last, and their page's one
  `GET /api/calls/:id` was refused with 429, which the server does not log. `CallPage.jsx`
  never asked again, so "Join call" never came. Runs since took 1.8 to 2 minutes and stayed under
  the limit. Fixed on both sides: the call page asks again after a refusal that passes (429, a
  server error, no answer; not after "no such call"), and the browser tests set
  `API_READS_PER_MINUTE` high (`playwright.config.js`), as they do for the chat connections.
  The call tests now check their start answer. Reproduced with the limit at 60 (2026-11-02): the
  old page hung at "Join call" (`callLayout.spec.js:74`), the new one passed.
- **The embedded chat shows the new-version notice** — closed by `fix/se-small-2`: "A new version
  of the chat is available." with Reload at the top of `/embed/chat`, by the site's own rule
  (`UpdateNotice.jsx`; docs/EMBED.md, docs/DEPLOYMENT.md "What visitors see").
- **A restore no longer brings back deleted accounts** — closed by `fix/se-small-2` (decided
  2026-11-02): each deletion notes the account's id, username and time in a journal beside the
  database, outside the backups, kept 30 days (`server/src/accounts/deletionJournal.js`); after a
  restore every account deleted since the backup is deleted again and named
  (`scripts/restore.mjs`; docs/DEPLOYMENT.md "Restoring", docs/AUTH.md; the privacy page and the
  account page name the 30-day note).
- **Event bot admin page inside the site** — closed by `feat/se-bot-admin`: the bot's own admin
  page is embedded, not rebuilt, with no second login (decided 2026-10-20). The host's nginx serves
  `/bot-admin/` and asks the site's `GET /api/bot-admin/authorize` before every request
  (`server/src/bots/adminAuthorizeRoutes.js`, only with `BOT_ADMIN_EMBEDDED=1`): organisers and
  admins with 2FA pass, a change needs the site's Origin and writes one audit entry
  (`bot_admin.change`); the bot's token stays with nginx. The sidebar's "Manage events" opens
  `/manage-events` with the page in a same-origin frame, after a health check with Retry. The bot
  side: bot project PR #58 (its base path and embedded mode). Details: docs/BOTS.md, "The event
  bot's admin page", and docs/AUTH.md.
- **Organisers create event-bot appointments on the site** — closed by `feat/se-bot-admin`:
  organisers may manage events (decided 2026-11-01) and do it on the embedded bot admin page
  ("Manage events", above), under their own name (`X-Acting-User`, logged by the bot).

- **Flaky test `devAdminScript.test.js`** — closed by `fix/test-dev-admin` (timed out twice under
  load on 2026-11-01, passed alone): its 20-second limit covered the whole run, and the run
  starts the whole server app, whose module loading alone took 7 of 11 s on an idle PC and far
  longer while other tests ran. The script now ends its output with "Dev admin ready." once
  everything is closed, and the test limits only the step from that line to the exit (5 s; a
  timer left running still fails it), with 150 s for the run itself. Checked: a 30-second timer
  left running and an unclosed server both fail it; a run under load that took 38 s passes.

- **Event bot images too large** — closed by `fix/se-event-images`: the live site refused six of
  the event bot's images (seen 2026-11-01). They are designer PNGs of 3.0-3.5 MB at 1536 x 1024,
  over the event images' 2 MB download limit (`server/src/config.js`, `bots.images`). The limit
  is now 10 MB and 15 s for event images only; the site keeps and serves its own 640px WebP copy
  as before (`server/src/bots/images.js`); the bot and its files are untouched.

- **Organisers set the site banner** — closed by `feat/se-organiser-banner` (owner proposal
  2026-11-01): organisers (with 2FA) change exactly the banner's on/off and text
  (`banner.enabled`, `banner.text`; link and style stay admin-only), and no other setting, at
  `/api/banner` (`server/src/settings/bannerRoutes.js`) on the page Site banner (`/banner`, in
  their sidebar) with a live preview; each change is audited like an admin's (`change.js`), with
  the same rules (docs/SETTINGS.md, "Who"; AUTH.md, "Site banner").

- **Home on a phone moved while its data arrived** — closed by `fix/test-home-shift-2`:
  `speed.spec.js`'s phone home test measured exactly 0.0530 on CI (limit 0.05) from 2026-11-01,
  also on master. `fix/test-home-shift` (PR #30) blamed other specs' calls and made the test
  answer "no call"; that was wrong, the test failed the same with it. The test now names what
  moved: the banner's season clock lost a line when the web font arrived (the page below moved
  19px), the featured game's centred label jumped 87px when the game arrived, and "Up next"
  outgrew its kept room with names that wrap. Fixed on a phone: the clock has fixed room, the
  game's content starts at the top, "Up next" keeps 16.5rem. The test pins three dates (the
  season clock's longest and shortest lines) and UTC, answers games and events itself, and no
  longer answers "no call". Before / after locally: 0.022-0.030 / 0.0012-0.0013 on each date.

- **Installer: one-command update** — closed by `feat/se-install-2` (SE-INSTALL-2; requested
  2026-11-01): `sudo /opt/seasonal-entertainment/deploy/install.sh --update` takes a fresh backup
  (if set up), fast-forwards the checkout to origin's default branch (refusing modified tracked
  files and diverged checkouts, never resetting or stashing) and re-runs that commit's installer
  (docs/DEPLOYMENT.md, "Updating"); the installer tests' nginx scenario updates from a bare
  "origin" in the server.
- **Backups to a Linux or macOS PC** — closed by `feat/se-install-2` (SE-INSTALL-2; owner proposal
  2026-11-01): docs/DEPLOYMENT.md "Backups to your PC", "Linux and macOS": age 1.2.1 from the
  release tarball, the key pair, `deploy/pc/get-seasonal-backups.sh` (POSIX sh; the same as the
  Windows script: sftp as the read-only backup user, every missing backup, the newest 30 kept,
  `download.log`), checking that one decrypts, the 2FA key copy readable for the owner only, and
  the daily run with cron or launchd. `get-seasonal-backups.test.sh` (a fake sftp) runs in CI.
- **Installer: the calls file as nginx's catch-all for 443** — closed by `feat/se-install-2`
  (SE-INSTALL-2; found on the first deployment, 2026-11-01): requests by IP address or without
  SNI get the same answer after a run as before it. The installer's files are now
  `zz-seasonal-*.conf` and load after the other sites' files (the old names are moved on the next
  run); the load order is checked with `nginx -T` before every reload and the certificate shown
  without SNI after it, and a change puts the files back and stops the run; where no other site
  listens on 443, a server of the installer's rejects the handshake (nginx 1.19.4 or newer;
  docs/DEPLOYMENT.md, "Unknown names stay with the other sites"). The installer tests' nginx
  scenario names the other site's file as on the real server and compares the answer before and
  after.
- **Installer: combined ufw rules** — closed by `feat/se-install-2` (SE-INSTALL-2; found on the
  first deployment, 2026-11-01): an existing rule that already lets a port in (a combined rule
  such as `80,443/tcp`, a range, a port without protocol, an app profile such as `Nginx Full`)
  counts, for IPv4 and IPv6 separately, so nothing redundant is added (docs/DEPLOYMENT.md, "What
  it does").
- **Installer: clearer questions and no silent pauses** — closed by `feat/se-install-2`
  (SE-INSTALL-2; seen on the first deployment, 2026-11-01): the calls and recording questions are
  explained when they are asked; long steps say how long they take and print "still working"
  while they run (apt's needrestart scan included); the admin password shows as `*`, is checked
  against the site's password rules before the confirmation and is asked again instead of
  stopping the run.
- **VPS deployment** — closed by the first deployment on 2026-11-01, commit `d1f8837`: the site,
  the call service with recording and the nightly encrypted backups run on the VPS in nginx mode
  beside its existing site (docs/DEPLOYMENT.md).
- **Age key pair for the backups** — closed by the first deployment on 2026-11-01, commit
  `d1f8837`: the key pair was made on the owner's PC (docs/DEPLOYMENT.md, "Backups to your PC");
  only the public key is on the VPS, and the first backup decrypted on the PC.

- **Installer: first real deployment** — closed by the first deployment on 2026-11-01, commit
  `d1f8837` (merge of PR #21, SE-INSTALL-1): cloned from GitHub on the server and run
  interactively as any user would; nginx mode beside the existing nginx site. Checked:
  `--status` healthy; the site, `www` redirect and calls name have Let's Encrypt certificates; call
  signalling upgrades to WebSocket (101); the existing named site answers as before with its own
  certificate; the bots' files are mounted read-only and the bots kept running untouched; the
  first backup decrypts on the PC. Still untested: call media over UDP from outside.

- **Admin-controlled settings (SE-SETTINGS-1)** — on `feat/se-settings-1` (not merged yet; owner
  requests 2026-10-23): site settings admins change on Admin → Settings instead of code
  changes, every default today's behaviour, every bound with its reason, every change audited
  and in effect at once (docs/SETTINGS.md): chat (uploads, sizes, pixels, previews, files in
  direct messages, connection and message limits, retention), calls (recording allowed,
  reminder lead), accounts (sign-out days, registration open, 2FA for every member), home
  (season clock, "Start here"), the weekly recap (on/off, day, hour, room) and a new site
  banner. Env values that were the source are now only defaults (docs/DEPLOYMENT.md). The
  finish (decided 2026-10-23): "Uploads on other sites" and "Images on other sites" are two
  independent switches, each with its per-site rule; the site banner's info style shows as info
  (it had lost to the shell's warning-looking `.banner`; a browser test now compares both).
- **Uploads and uploaded images in the chat on other sites** — built behind switches, off by
  default (2026-10-23, `feat/se-settings-1`): "Uploads on other sites" (members upload there) and
  "Images on other sites" (members-only images through 5-minute signed links bound to the file and
  their embed token), independent of each other, each with the site's own rule (docs/EMBED.md,
  "Files on other sites").
- **Guests writing in the chat on other sites** — built behind switches, off by default
  (2026-10-23, `feat/se-settings-1`): "Guests can read/write on other sites" and each site's own
  rule; the guest name travels as a signed guest token kept in the frame's own storage, no
  third-party cookie (docs/EMBED.md, "Guests on other sites").

- **Technical debt (SE-DEBT-1)** — closed by `chore/se-debt-1` (merged, PR #19; owner request
  2026-10-23), no visible change:
  - **The hidden listener's name** — one constant, `shared/callPeople.js`, used by
    `server/src/calls/people.js` and `client/src/calls/stageModel.js`.
  - **Unit tests for turning 2FA off and the device key store** — `twoFactorDisable.test.jsx` and
    `deviceKey.test.js` (over `client/src/test/memoryIndexedDb.js`); both files now 100 % of
    lines; no bug found.
  - **A coverage script** — `npm run test:coverage` (`scripts/coverage.mjs`, `@vitest/coverage-v8`),
    reports in `coverage/`, not part of verify or CI; lines today: shared 100 %, server 96.4 %,
    client 93.8 %.
  - **The event bot's images** — under the 50-megapixel limit too (`config.imageMaxPixels`).
- **Project audit (SE-AUDIT-1)** — closed by `chore/se-audit-1` (merged, PR #18; owner request
  2026-10-23): an image's size is checked from its header before it is decoded; Caddy's logs leave
  out the embed token's headers; 59 unused exports removed and one secret length rule; docs,
  headers and comments made true to the code; two tests wait for the server instead of a clock;
  a failed browser test's trace and screenshot are uploaded on CI. The audit's questions, each
  decided 2026-10-23 and closed by the same branch:
  - **Pixel limit** — built: chat uploads and link-preview images (rooms and direct messages)
    over 50 megapixels are refused from the header, before decoding (`config.imageMaxPixels`);
    10 MB per file and 50 MB a day unchanged.
  - **A reporter's copy of a direct-message file** — stays outside the upload quota; a comment
    at `server/src/directFiles/routes.js` says why.
  - **The per-username login block** — kept as it is (docs/AUTH.md, "Rate limits").
  - **`CSRF_STRICT=false` in production** — refused at start, like an http origin and
    `COOKIE_SECURE=false` (docs/DEPLOYMENT.md).
  - **The approved design mockups** — not edited; `docs/design/se-style/README.md` marks them
    historical (heading weight 700, no "best buy" wording).
  - **Audit entries of deleted test accounts** — kept: the audit log is deliberately not
    deletable, and production starts with a fresh database.
  - **Screenshots under `reports/`** — deleted (about 100 MB); the morning sheets stay.
  - **Docker leftovers of unproven origin** — left; they can be removed in Docker Desktop.
- **No "best buy" wording** — closed by the SE-NIGHT-6 finish (`feat/se-night-6`; owner decision
  2026-10-23): the fair price table's rank shows only the number, under "Rank (vs. fair price)",
  with a line saying what it shows and the not-financial-advice link; "underpriced" and
  "overpriced" stay (they describe the calculation). The converter, the home fair-price box, the
  season clock and the weekly recap had no recommending words (docs/BOTS.md, "Fair price").
- **"Start here" path** — closed by SE-NIGHT-6 piece 5 (`feat/se-night-6`, merged, PR #17; owner
  request 2026-10-23): `/start` with five short steps and buttons to existing pages (what Seasonal
  Tokens are, how they work, the risks, the prices and the fair price, the chat and the next call)
  and the not-financial-advice notice; "Start here" in the sidebar for everyone and "New here?
  Start here" on home for guests (docs/DESIGN.md, "Start here").
- **Recordings archive with chapters** — closed by SE-NIGHT-6 piece 4 (`feat/se-night-6`, merged, PR
  #17; owner request 2026-10-23): `/calls/recordings` lists every recording for the calls' audience,
  newest first, with call title, date, length, player and a search over the titles; organisers and
  admins add, change and delete chapter marks (m:ss or h:mm:ss, a title of at most 80 characters,
  audited), shown under the player on the call page and in the archive, a click seeking the player
  there (docs/CALLS.md, "Recording").
- **Weekly recap** — closed by SE-NIGHT-6 piece 3 (`feat/se-night-6`, merged, PR #17; owner
  request 2026-10-23): every Monday from 09:00 Vienna time the site posts, as "Seasonal
  Entertainment" (no account behind it), the week's price changes, the next 7 days' events and
  calls, the new call recordings and the not-financial-advice line in Announcements; once per
  week even across restarts; "Post recap now" for admins (audited); the "Weekly recap"
  notification, off by default (docs/CHAT.md, "Weekly recap").
- **Season clock on home** — closed by SE-NIGHT-6 piece 2 (`feat/se-night-6`, merged, PR #17;
  owner request 2026-10-23): the token in season and the next halving, from the token
  contracts' own schedule (`shared/seasonClock.js`, constants cited from `contracts/*Token.sol`;
  the four creation times read with a public read-only `eth_call`). It also settles the earlier
  disagreement between official sources: the second Spring halving is in June 2025 (5 June, by
  the contract; the Medium update's 5 September 2025 is not the contract's date), and the total
  supply per token is 33,112,800 (`SpringToken.sol:22`, the same in all four contracts).
- **"Not financial advice" notice** — closed by SE-NIGHT-6 piece 1 (`feat/se-night-6`, merged, PR
  #17; owner request 2026-10-23): "Not financial advice" beside Imprint and Privacy on every page
  (sidebar and phone menu) opens the new Disclaimer info page, seeded published; the notice
  "Information only — not financial advice." with its Disclaimer link on the prices page and in the
  home fair-price box (docs/DESIGN.md).
- **The ten info content pages** — checked against the official sources (seasonaltokens.org,
  the whitepaper, the three audit reports, the Telegram and Medium links) and published
  (2026-10-22, SE-INFO-PUBLISH): what-are-seasonal-tokens, how-it-works, mining, farming,
  charts-and-trading, faq, risks, security-audits, team and official-channels. Additions only:
  the trade page's advice and the chart model (Charts and trading), what the Callisto and
  QuillAudits reports say (Security audits), the Medium "Four Years of Data" update as a
  source (How it works). A fresh database seeds them published; Imprint and Privacy stay
  drafts (`server/src/info/seed.js`).
- **Security check findings (owner decision 2026-10-22)** — closed by SE-NIGHT-5 piece 1
  (`feat/se-night-5`, merged, PR #15), each with its outcome:
  - **WebSocket connection limit** — built: at most 5 open chat connections per member account,
    20 per address for guests; a refused one is told so and does not retry in a loop
    (docs/CHAT.md, "Connection limits").
  - **A limit on `/media`** — not built.
  - **A limit on the admin password reset** — not built.
  - **In-memory rate limits resetting on a restart** — accepted.
  - **Sessions** — signed-in sessions end after 7 days without use, renewed by every request
    at most once a minute (docs/AUTH.md, "Sessions").
- **A ratio view between the seasons** — not wanted (owner decision 2026-10-22).
- **Call recording** — closed by SE-NIGHT-5 piece 7 (`feat/se-night-5`, merged, PR #15; owner
  decision 2026-10-22): LiveKit Egress room composite to MP4 (1280 x 720, 15 fps, H.264 about
  1 Mbit/s, AAC 64 kbit/s), off unless set up; organisers and admins start and stop it, ending
  the call stops it; a red "Recording", a start banner, and joining or sending only after "I
  understand this call is being recorded"; recordings on the call's page with a player,
  deleted only by organisers and admins; included in backups. Tested with a real egress on
  the PC; a real call on the VPS is still to try (docs/CALLS.md, "Recording";
  docs/DEPLOYMENT.md, "Call recording").
- **Flaky browser test `embedForeign.spec.js`** — closed by the SE-NIGHT-5 follow-up, part 4
  (`feat/se-night-5`). Two causes in the tests, none in the site: the member-login helper
  (`client/e2e/members.js`) waited for the recovery-code offer, which comes only at a
  member's first login, so a second run hung; it now asks the run's database whether the key
  pair exists. And the test put the chat below the window of the site's own page, which never
  scrolls, so its "Log in" click needed that page scrolled while the parallel tests kept
  changing it; `frameOf` (`client/e2e/frames.js`) now shows the chat in view.
- **Slow test `devAdminScript.test.js`** — closed by the same part 4: the script ran at the
  production bcrypt cost (the only server test that did), and on a run again derived a key and
  had it hashed for a bootstrap that could only be refused. The test now runs at the tests'
  cost; the script asks the database first. A stopped run is awaited before its folder is
  deleted. The 20-second limit is unchanged.
- **The info editor's stretched "Save" button** — closed by the SE-NIGHT-5 finish
  (`feat/se-night-5`): beside a long preview, the editor's grid stretched the form, which gave
  the extra height to its rows and made "Save" as tall as the preview column. The editor's
  columns now keep their own height (`align-items: start` on `.editor`, `admin/admin.css`);
  `client/e2e/info.spec.js` checks that "Save" is as tall as "Publish".
- **Mono sound for call recordings** — not built (decided 2026-10-22): recordings stay stereo
  at about 64 kbit/s, because LiveKit's encoding options have no channel setting; no code
  change (SE-NIGHT-5 follow-up, part 2; docs/CALLS.md, "Recording").
- **Operating-system notifications for mentions and direct messages** — closed by SE-NIGHT-5
  piece 6 (`feat/se-night-5`, merged, PR #15; owner decision 2026-10-22): browser notifications
  while the site is open and no tab of it is visible, one per event across tabs; permission only
  on "Turn on notifications"; switches for mentions and direct messages, off until turned on;
  a direct message's notification never shows its text (docs/CHAT.md, "Notifications").
- **Unlock a new device by confirming it on an already logged-in device** — closed by SE-NIGHT-5
  piece 5 (`feat/se-night-5`, merged, PR #15; owner decision 2026-10-22): "Confirm on another
  device" beside the password and the recovery code; the unlocked device confirms the same
  6-digit code and seals the private key to the new device's one-time key; the server relays
  the box once and deletes it; requests valid 5 minutes, one at a time, audited (docs/AUTH.md,
  "Unlock on another device").
- **File uploads in direct messages** — closed by SE-NIGHT-5 piece 4 (`feat/se-night-5`, merged, PR
  #15; owner decision 2026-10-22): encrypted in the sender's browser with a fresh key per file
  (libsodium secretstream), the server stores ciphertext only and serves it to the two members only;
  only real PNG, JPEG, GIF and WebP are shown inline, everything else is a download; a report shares
  the file decrypted by the reporter; a deleted message takes its file along (docs/CHAT.md, "Files
  in direct messages").
- **Link previews in direct messages** — closed by SE-NIGHT-5 piece 3 (`feat/se-night-5`, merged, PR
  #15; owner decision 2026-10-22): the sender's browser asks a route that stores and logs nothing;
  the card (with a small inline image) travels inside the encrypted message, and the recipient's
  browser never contacts the linked site; account setting, on by default (docs/CHAT.md, "Link
  previews in direct messages").
- **Linking calls to events** — closed by SE-NIGHT-5 piece 2 (`feat/se-night-5`, not merged
  yet; owner decision 2026-10-22): an organiser links a planned call to one of the event bot's
  next 30 days' occurrences; that event offers "Listen on this site" in "Up next" and on
  `/events` instead of a second entry, and the call's page names the event; a vanished or moved
  occurrence just loses the link (docs/CALLS.md, "Linked to a bot event").

- **SE-UPNEXT-CALLS-1 — "Up next" lists site calls too; the Next call box only with a call** — on
  `feat/se-upnext-calls-1` (merged, PR #14; owner request 2026-10-21): the home's "Up next" and
  `/events` show the site's live and planned calls among the event bot's occurrences by start time,
  from the Calls page's own answer (docs/CALLS.md, "In the event lists"); the Next call box shows
  only with a live or planned call, else Fair price takes its column; home still fits from 1280 x
  720 in both cases (docs/DESIGN.md, "Home"). After the owner's review: on `/events` a call's line
  says "Community call on this site" without repeating the date, with no empty line under its title.

- **SE-HOME-LIVE-1 part 1 — "Next call" box on the home page** — closed by `feat/se-home-live-1`
  (merged, PR #13; owner request 2026-10-21): a live call with Listen, else the next planned one
  with its time, else a friendly line; the calls quarter behind it (docs/DESIGN.md, "Home").
- **SE-HOME-LIVE-1 part 2 — "Add to calendar"** — closed by `feat/se-home-live-1` (not merged
  yet): an RFC 5545 file per planned call for everyone, on the Calls page and in the Next call
  box (docs/CALLS.md, "Calendar file").
- **SE-HOME-LIVE-1 part 3 — "Remind me on this site"** — closed by `feat/se-home-live-1` (merged, PR
  #13): members' reminders, notices 10 minutes before and when live on every open page, once per
  kind (docs/CALLS.md, "Reminders").
- **SE-HOME-LIVE-1 part 4 — live Community box** — closed by `feat/se-home-live-1` (not merged
  yet): the online count and the newest messages of General, live; the 24-hour rule (docs/CHAT.md,
  "Community box").
- **SE-HOME-LIVE-1 part 5 — empty Calls lists and the wide prices page** — closed by
  `feat/se-home-live-1` (merged, PR #13): cards instead of "None."; the prices page in the wide
  column with fair price and converter side by side from 1100px (docs/DESIGN.md).
- **SE-HOME-LIVE-1 follow-up (owner review 2026-10-21)** — on `feat/se-home-live-1` (not merged
  yet): the Next call title wraps instead of being cut (full title as name and tooltip), the
  zone stays with its time; the home's end clears the chat button and no box is cut (the home
  scrolls when its content needs it); Fair price's marks in one row with the arrow beside the
  title; the fair price table never sticks out, all rows equal, scrolling inside below 1100px.
- **SE-HOME-LIVE-1 follow-up 2 (owner decision 2026-10-21)** — on `feat/se-home-live-1` (merged, PR
  #13): home fits the window again from 1280 x 720 (a lower banner, tighter spacing, the Next call
  buttons as icons in one row, its title in 2 lines), no box cut, nothing under the chat button; one
  date format everywhere (`formatDateTime`, docs/DESIGN.md, "Dates").
- **SE-HOME-LIVE-1 final step (owner decision 2026-10-21)** — on `feat/se-home-live-1` (merged, PR
  #13): headings in Luxora Grotesk Bold instead of Heavy (`--font-weight-heading` 700); the unused
  Heavy face and its font file removed.
- **Security check (SE-NIGHT-4 piece 4)** — closed by SE-NIGHT-4 piece 4 (`feat/se-night-4`,
  merged, PR #12): no known vulnerabilities (npm audit), react-router 8.4.0 → 8.5.0; salt
  requests and every `/api` read limited per IP; link-preview failures logged by host only.
  Design questions are on the morning sheet (reports/NIGHT-2026-10-21.md).
- **Safety-number verification** — closed by SE-NIGHT-4 piece 3 (`feat/se-night-4`, not merged
  yet): "Verify safety number" in a direct conversation's "…"; both members see the same 12
  groups of 5 digits (BLAKE2b of the two sorted public keys); "Mark as verified" per device
  with a "Verified" badge; trust on first use with a key-change notice that removes the mark,
  sending never blocked (docs/CHAT.md, "Safety numbers").
- **Speed and phone width** — closed by SE-NIGHT-4 piece 2 (`feat/se-night-4`, not merged
  yet): pages loaded on first use (first JavaScript 293 → 113 KB gzip), hashed files cached for
  a year, smaller brand images, lazy decoration, no layout shift while data arrives, 44px
  touch targets on every page at phone width (docs/DESIGN.md, "Speed").
- **SE-REDESIGN-1 — the SE style** — closed by SE-NIGHT-4 piece 1 (`feat/se-night-4`, not merged
  yet; reference approved 2026-10-20, kept in `docs/design/se-style/`): new tokens (the four
  token colours, glows over warm white or night blue, the seasons' sidebar gradient,
  translucent cards, pills), the logo's emblem and quarters as brand images, the sidebar with
  the emblem, solid current item and season dots, the home page as banner, featured game and
  Up next, four season price tiles, Community and fair price, the sub pages' quarter headers
  and faint quarters, the prices banner, the login card's logo (docs/DESIGN.md). The home
  sparkline went with the old price card.

- **Small prices cut to two decimals** — closed by SE-BOTS-2c (PR #11, `feat/se-bots-2`, merged
  2026-10-20; owner request 2026-10-20): POL showed $0.09 where the price bot shows 0.094195. One
  rule for every coin's price on the prices page now (`formatUsd`): below $1 at least four
  significant digits ($0.09420), from $1 on two decimals.

- **Several coins on one price chart, BTC, a converter with every coin** — closed by SE-BOTS-2b (PR
  #11, `feat/se-bots-2`, merged 2026-10-20; owner request 2026-10-20): BTC joins ETH and POL as a
  reference coin (CoinGecko `bitcoin`, about 78 calls a day in all); the coin buttons on
  `/info/prices` toggle the coins on the one chart, two or more shown as % change since the range's
  start with a legend, the choice kept in the address; the converter offers every connected coin
  (docs/BOTS.md, "The chart: one coin or several").

- **The first roadmap list's finished items** — checked against the tree by SE-BOTS-2
  (2026-10-20) and moved here: info pages with admin editor (SE-NIGHT-1 piece 5); accounts with
  2FA for organisers and admins (pieces 2 and 3; Discord/Telegram login stays open); the games
  hub (piece 7; the race-game connection stays open); chat (piece 8 and the chat work after it);
  notifications inside the site — unread counters and @mentions (SE-DM-2; operating-system
  notifications stay a proposal); admin pages (users, audit log, info pages, games, chat rooms,
  chat media, settings, embedding; the events calendar editor was dropped, events come from the
  event bot, SE-BOTS-2 part 2).

- **Prices of ETH and POL** — closed by SE-BOTS-2 part 1 (PR #11, `feat/se-bots-2`, merged
  2026-10-20; owner decision 2026-10-20): the site fetches their history from CoinGecko's free Demo
  API (`COINGECKO_API_KEY`, server only), keeps a year of it in its own database, refreshed daily
  and hourly, and shows ETH and POL as a reference row on `/info/prices` with CoinGecko's
  attribution (docs/BOTS.md, "Reference prices"). **Owner**: create the Demo key and put it in
  `site.env`.

- **Fair price and converter with mining time** — closed by SE-BOTS-2 part 4 (PR #11,
  `feat/se-bots-2`, merged 2026-10-20; owner decision 2026-10-20): `/info/prices` shows the price
  bot's `/value` fair price table and its `/swap` converter with mining times, from the bot's
  `mining_rates.json` (`PRICE_BOT_MINING_RATES`, read-only); the arithmetic is ported with the bot's
  own test numbers (docs/BOTS.md, "Fair price and converter").

- **Event images from the bot** — closed by SE-BOTS-2 part 3 (PR #11, `feat/se-bots-2`, merged
  2026-10-20; owner decision 2026-10-20): the server fetches each event's image through the link
  previews' network guard, re-encodes it without metadata, stores it by a hash of its URL and
  refreshes it at most daily; `/events` and "Up next" show it from this site (docs/BOTS.md, "Event
  images").

- **Keep or drop the site's own event admin** — closed by SE-BOTS-2 part 2 (PR #11,
  `feat/se-bots-2`, merged 2026-10-20): dropped (owner decision 2026-10-20). Events are kept only in
  the event bot; the site's editor, routes, seeded schedule, store and `events` table are gone, and
  `/events` and the home page's "Up next" read only the bot (docs/BOTS.md).

- **Own room message seen twice in the chat on another site** — closed by SE-NIGHT-3 piece 4
  (`feat/se-night-3`, PR #8, merged 2026-10-20): not shown twice. The browser check's
  `getByText` also matched the composer's field, which still holds the text until the send is
  answered, while the live push had already listed the message. Reproduced every time with
  the answer held back and in 2 of 30 natural runs; never twice in the list. The client tests
  that had the same blind spot now look inside the message list, and a new test pins the
  push-before-answer case (docs/CHAT.md, "Sending").

- **Prices and events from the owner's bots** — closed by SE-NIGHT-3 piece 3 (`feat/se-night-3`,
  PR #8, merged 2026-10-20): read-only reads of the price and event bots' SQLite files
  (`PRICE_BOT_DB`, `EVENT_BOT_DB`, docs/BOTS.md); a price card on the home page, charts at
  `/info/prices`, the bot's occurrences on `/events`; fake fixture data for development. The
  part-one entry "Bots and group roles" stays open for the group roles.

- **A 2FA secret that decrypts but cannot be used answered 500** — closed by SE-NIGHT-3 piece 2
  (`feat/se-night-3`, PR #8, merged 2026-10-20): `openSecret` (`server/src/twofa/secretBox.js`)
  refuses such a secret (e.g. encrypted twice) like one that does not decrypt: the same 401
  answer and a log line in the same style. Found in SE-EMBED-CHECK-1.
- **`data/DEV-ADMIN.txt` held a stale 2FA secret** — closed by SE-NIGHT-3 piece 2
  (`feat/se-night-3`, PR #8, merged 2026-10-20): `npm run dev:admin` rewrites the file's 2FA part
  from the stored secret when the account already has 2FA; it never resets or changes that
  2FA. Run once on 2026-10-20, so the file is current. Found in SE-EMBED-CHECK-1.

- **The chat on another site showed controls it cannot use** — closed by SE-EMBED-CHECK-2
  (PR #7, merged 2026-10-20), from the screenshots of SE-EMBED-CHECK-1:
  - a guest there saw the composer and "your first message gets a guest name", but a guest
    name needs a cookie: now one "Log in to write" opens the same login popup (`LogInToWrite`,
    `client/src/embed/EmbedAccount.jsx`);
  - a member logged in with an embed token saw "Attach file", which the server refuses there:
    now hidden through the composer's `files` switch (`ChatPanel` passes it on);
  - the popup's not-logged-in step had its "Log in" button squeezed under the text: now a card
    like the Allow step;
  - the login and registration pages inside the popup (`?next=/embed-login…`) showed the
    floating chat button: now hidden there (`inEmbedLoginFlow`,
    `client/src/session/nextPage.js`).
- **Registering from the chat's login popup lost the way back** — closed by SE-EMBED-CHECK-1
  (PR #7, merged 2026-10-20): the login page's "Register" link now keeps `?next=`, and registration
  returns there like the login does (`client/src/session/nextPage.js`), so a new visitor lands
  back in the popup with the requesting site named. Found by the browser check of the
  foreign-site login.
- **Backups kept at the owner's PC** — closed by the SE-NIGHT-2 follow-up, part B (PR #7, merged
  2026-10-20; owner decision 2026-10-19): nightly backups encrypted with age to the owner's
  public key (on by default), a PowerShell download over read-only sftp with catch-up and
  retention, restore from the decrypted .tar, a CI restore of an encrypted backup
  (docs/DEPLOYMENT.md, "Backups to your PC").
- **Chat embedding on other sites** — closed by the SE-NIGHT-2 follow-up, part A (PR #7, merged
  2026-10-20; owner decision 2026-10-19): admin list "Embedding" (exact https origins, audited),
  `frame-ancestors` for `/embed/*` from that list, login through a popup on this site handing
  the frame a 12-hour embed token and the unlocked key (memory only), rooms and direct messages
  there, uploads/account/admin refused (docs/EMBED.md, AUTH.md "Embed tokens").
- **Check a live room message right after login** — closed by SE-NIGHT-2 part 1
  (`feat/se-night-2`, PR #7, merged 2026-10-20). Answer: yes, it could miss its live update until
  reload, in two ways, both shown red by client/src/chat/chatCatchUp.test.jsx against the old
  code: a message stored between the panel's load and the new socket's subscription was never
  pushed, and a message pushed while the load was on its way was wiped by the load. Fixed by a
  catch-up fetch (`?after=<id>`) on every `subscribed` and a merge by id; no timeout changed.
- **Stale live calls** — closed by SE-NIGHT-2 part 2 (PR #7, merged 2026-10-20): a live call whose
  LiveKit room is gone is ended after 10 minutes like "End call", audited as "system"
  (docs/CALLS.md, "Stale live calls").
- **Password key derivation freezes the page** — closed by SE-NIGHT-2 part 3 (PR #7, merged
  2026-10-20): Argon2id runs in a same-origin Web Worker; password buttons read "Checking…"; no CSP
  change (docs/AUTH.md, "Off the main thread").
- **2FA secrets encrypted at rest** — closed by SE-NIGHT-2 part 8 (PR #7, merged 2026-10-20): TOTP
  secrets sealed with libsodium under `SECRET_ENCRYPTION_KEY` (required in production), plain
  rows encrypted on start, a wrong key refuses with a clear log line (docs/AUTH.md).
- **Deployment preparation for the VPS** — closed by SE-NIGHT-2 part 7 (PR #7, merged
  2026-10-20): deploy/site/ (Dockerfile, compose with Caddy, Caddyfiles, systemd timers),
  nightly SQLite online backups with restore, production refuses development defaults, the
  first-admin script, CI builds the image; runbook docs/DEPLOYMENT.md.
- **Remove the legacy-login route and the legacy flag in pre-login before go-live** — closed by
  SE-NIGHT-2 part 7 (PR #7, merged 2026-10-20): no account in the development database was flagged
  legacy and nothing outside the legacy flow depended on it; route, flag, browser branch, dev
  admin script branch and migration step removed (docs/AUTH.md, "Login key split").
- **Chat embedding on this site's own pages** — closed by SE-NIGHT-2 part 6 (PR #7, merged
  2026-10-20): `/embed/chat` with the site's login state, a postMessage API with origin checks,
  `frame-ancestors 'self'` for `/embed/*` only, a demo page and docs/EMBED.md with the race
  game's snippet.
- **Cleanup: one fake WebSocket, one media library load** — closed by SE-NIGHT-2 part 5 (PR #7,
  merged 2026-10-20): the six per-test fake sockets replaced by client/src/test/fakeSocket.js; the
  sticker/GIF library loaded once per page and shared (client/src/chat/mediaLibrary.js).
- **Older direct messages** — closed by SE-NIGHT-2 part 4 (PR #7, merged 2026-10-20): a
  conversation pages back 100 at a time on reaching the top, keeping the scroll position
  (docs/CHAT.md, "Direct messages").
- **SE-CALLS-1 — community calls on LiveKit** — closed by PR #6 (`feat/se-calls-1`), merged
  2026-10-18. Piece 1: the call service's configuration and portability (`deploy/calls/`,
  `npm run dev:calls`). Piece 2: calls, roles and management, the call chat, admin settings.
  Piece 3: join tokens and stage permissions (the server decides). Piece 4: the stage page.
  Piece 5: docs/CALLS.md, docs/SCALING.md, the privacy draft. Eye-test fixes in the same PR:
  SE-CALLS-2 (a screen share always shows; the spotlight columns migrated; sound notice; listener
  chips; the compact chat composer), SE-CALLS-3 (the stage gets the room; icon controls; the
  sidebar rail; collapsible call chat; full screen; the "…" message menu everywhere), SE-CALLS-4
  (toggles name their action; cameras uncropped; scrollbars only on overflow).
- **SE-NIGHT-1 piece 1 — App shell** — closed by PR #3 (`feat/se-night-1`), merged 2026-10-18.
  Client routing, layout with header and footer, 404 page, security headers.
- **SE-NIGHT-1 piece 2 — Database and accounts** — closed by PR #3 (`feat/se-night-1`), merged
  2026-10-18. SQLite, registration, login, logout, password change, roles, bootstrap of the first
  admin, CSRF, rate limits.
- **SE-NIGHT-1 piece 3 — Two-factor authentication** — closed by PR #3 (`feat/se-night-1`), merged
  2026-10-18. TOTP with QR code, recovery codes, required for organisers and admins.
- **SE-NIGHT-1 piece 4 — Admin: users, roles and audit log** — closed by PR #3 (`feat/se-night-1`),
  merged 2026-10-18. /admin with user search, role, can-start-games, lock, password reset; audit log
  for every admin action.
- **SE-NIGHT-1 piece 5 — Info pages with editor** — closed by PR #3 (`feat/se-night-1`), merged
  2026-10-18. Public /info, admin editor with preview, draft pages from the official sources,
  Imprint and Privacy drafts.
- **SE-NIGHT-1 piece 6 — Events calendar** — closed by PR #3 (`feat/se-night-1`), merged 2026-10-18.
  /events week in local time, admin editor, the weekly schedule seeded.
- **SE-NIGHT-1 piece 7 — Games hub** — closed by PR #3 (`feat/se-night-1`), merged 2026-10-18.
  /games cards by status and visibility, admin editor, "Seasonal Race" (coming soon). The race-game
  connection stays open.
- **SE-NIGHT-1 piece 8 — Chat** — closed by PR #3 (`feat/se-night-1`), merged 2026-10-18. Live chat
  over WebSocket, rooms, guests with guest names, moderation (hide, mute, ban), reports, retention.
- **SE-CHAT-COMPOSER-1 — Chat as a reusable module; attachments, file uploads, scrolling** — closed
  by PR #3 (`feat/se-night-1`), merged 2026-10-18. Part A: the chat is one client module
  (`<ChatPanel>`, one connection per page) and one server area (`mountChat`), docs/CHAT.md. Part B:
  a message is optional text plus one attachment; stickers and GIFs are attached, not sent on click.
  Part C: members upload images and PDFs (metadata removed, access-checked, deleted with their
  message). Part D: the message list follows new messages, or offers "New messages" when scrolled
  up. Part E: `.env.example` complete and in the repository, `npm run dev:admin` exits on its own,
  check data removed.
- **SE-DESIGN-1 — Arena app shell, fixed viewport, dark mode, chat drawer** — closed by PR #4
  (`feat/se-design-1`), merged 2026-10-18. Part A: light/dark tokens, theme rule, no flash of the
  wrong theme. Part B: sidebar shell, no page scroll, home bento, full-height chat page. Part C:
  chat button and drawer with a room picker on every page except /chat and /admin. docs/DESIGN.md.
  Part D closes "ChatPanel keeps guest level after login": on login, logout or an account switch the
  chat module's shared connection reconnects as the new reader and the rooms and messages reload
  (docs/CHAT.md). Part E: the leftover check message removed from the development database and a
  stale `npm run dev:admin` process ended (2026-10-17).
- **SE-DM-1 — favourites, end-to-end encrypted direct messages, report with consent** — closed by PR
  #5 (`feat/se-dm-1`), merged 2026-10-18. Piece 1: favourite rooms (star in the drawer's picker and
  the full chat's room list, favourites first) and favourite members (name menu in every message),
  members only. Piece 2: the password never leaves the browser (Argon2id in the browser, only a
  derived auth key is sent; pre-login salt; one-time legacy upgrade; docs/AUTH.md). Piece 3: every
  member's key pair, made in the browser, the private key only sealed on the server; optional
  recovery code; unlock, recovery and start over (docs/CHAT.md, "Keys and the recovery code"). Piece
  4: end-to-end encrypted direct messages between members (drawer and /chat Direct tab, name menu,
  unread dot, key-change notice; docs/CHAT.md, "Direct messages"). Piece 5: reporting a direct
  message with consent (copies only when the reporter ticks to share them; moderators' views
  audited; copies deleted 90 days after review).
- **SE-DM-2 — unread counters, room mute, @mentions, member search, favourites star, presence
  setting, security fix** — closed by PR #5 (`feat/se-dm-1`), merged 2026-10-18. Part 1: unread
  counters for rooms (blue) and private messages (orange), live in every tab (docs/CHAT.md, "Unread
  counters"). Part 2: muting a room (bell; left out of the room total, its count dimmed). Part 4:
  "Find a member" in the Direct tab. Part 3: @mentions (notify also in muted rooms; name chips;
  suggestions). Part 5: the favourite star in the Direct list and the search results. Part 6: "Show
  when I'm online" (account page, Privacy; on by default). Part 7: the recovery-code routes need the
  password too; docs.
- **SE-CHAT-MEDIA-1 — Chat emojis, stickers, GIFs and link previews** — closed by PR #3
  (`feat/se-night-1`), merged 2026-10-18. Part A: emoji picker for everyone. Part B: own sticker and
  GIF library (admin page, starter pack), members send stickers and GIFs. Part C: server-side link
  previews with SSRF protection, moderation of previews.
- **SE-SECURITY-FIX-1 — Security review fixes** — closed by PR #3 (`feat/se-night-1`), merged
  2026-10-18. Dev-proxy "wrong origin", staff 2FA in the chat, sockets following account changes,
  per-IP guest limits, 2FA password and session hygiene, production proxy settings and per-username
  login limit, access before id lookups, pending 2FA login epoch, WebSocket scheme check,
  guest-writable rooms.
- **Unread count for the chat button** — closed by SE-DM-2 part 1 (`1bd2f79`, PR #5, merged
  2026-10-18): unread counters for rooms and private messages on the chat button, the sidebar, the
  room lists, the Direct list and the tabs (docs/CHAT.md, "Unread counters").
- **SE-FOUNDATION-1** — closed by PR #1 (`feat/se-foundation-1`), merged 2026-10-17.
  Repository, license, server with `/api/health`, landing page, design tokens, fonts,
  web-ready season marks with build script, tests, `npm run verify`, CI.
