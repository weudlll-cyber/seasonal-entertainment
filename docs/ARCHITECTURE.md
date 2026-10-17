# Architecture

## Decisions

- Public repository `weudlll-cyber/seasonal-entertainment`, license AGPL-3.0-or-later,
  copyright holder weudlll-cyber (decided 2026-10-16).
- Same stack as the race game (decided 2026-10-16).
- Luxora Grotesk may be used on the web (confirmed 2026-10-16).
- Target runtime is a Linux VPS running for months. Nothing in the code may assume Windows.

## Stack

| Part    | Technology                                           |
| ------- | ---------------------------------------------------- |
| Client  | React 19 + Vite, react-router (declarative routes)   |
| Server  | Node 24 LTS + Express 5                              |
| Storage | SQLite (better-sqlite3), one file, path from config  |
| Tests   | Vitest (server and client), Playwright (browser)     |
| Quality | ESLint (flat config), Prettier                       |
| CI      | GitHub Actions, runs `npm run verify` (see `ci.yml`) |

The repository is one npm workspace root with three packages, `shared`, `server` and
`client`, and one lockfile. `shared/` holds only rules both sides must apply identically
(account rules: username format, password length, minimum age, role order); it exists since
2026-10-17 because a registration form must never accept what the server refuses.

## Data

One SQLite file (`DATABASE_PATH`, default `data/seasonal.db`; `data/` is gitignored),
opened by `server/src/db/database.js`. Each area owns one schema module of
`CREATE TABLE IF NOT EXISTS` statements (e.g. `server/src/accounts/schema.js`), applied at every
start, and one small data module (e.g. `userStore.js`). No ORM. Sessions live in the same file
(table `sessions`). Tests use a temporary database each and delete it. Accounts, sessions,
roles and the bootstrap are described in [AUTH.md](AUTH.md).

## Ports

The race game uses 5173 and 4173; this project stays clear of them.

| Port | What                                                     |
| ---- | -------------------------------------------------------- |
| 3800 | Server (`npm start`, and the API behind `npm run dev`)   |
| 5380 | Vite dev server (`npm run dev`), forwards `/api` to 3800 |
| 3810 | Server started by the Playwright browser tests           |

## Runtime configuration

Read from the environment when the process starts, never baked into a build:

| Variable              | Default                   | Used by                                                         |
| --------------------- | ------------------------- | --------------------------------------------------------------- |
| `HOST`                | `127.0.0.1`               | server listen address                                           |
| `PORT`                | `3800`                    | server listen port                                              |
| `CLIENT_DIST`         | `client/dist`             | folder of the built client the server serves                    |
| `COMMIT_SHA`          | output of `git rev-parse` | commit reported by `/api/health`                                |
| `CLIENT_PORT`         | `5380`                    | Vite dev server port                                            |
| `API_ORIGIN`          | `http://127.0.0.1:3800`   | where the Vite dev server forwards `/api`                       |
| `NODE_ENV`            | (unset)                   | `production`: Secure cookies, secret required                   |
| `DATABASE_PATH`       | `data/seasonal.db`        | SQLite file                                                     |
| `SESSION_SECRET`      | random per start (dev)    | signs session cookies; required in production                   |
| `BOOTSTRAP_TOKEN`     | (unset)                   | one-time first-admin creation (AUTH.md)                         |
| `PUBLIC_ORIGIN`       | from the Host header      | own origin for CSRF/WebSocket origin checks                     |
| `TRUST_PROXY`         | `0`                       | number of reverse proxies in front                              |
| `COOKIE_SECURE`       | `true` in production      | Secure session cookie                                           |
| `CSRF_STRICT`         | `true`                    | refuse state changes without Origin/Referer                     |
| `BCRYPT_COST`         | `12`                      | password hashing cost (4–15)                                    |
| `REQUIRE_STAFF_2FA`   | `true`                    | organisers/admins must use 2FA; `false` only outside production |
| `CHAT_RETENTION_DAYS` | `90`                      | chat messages older than this are deleted                       |

The server loads `.env` from the repository root if present; real environment variables win.
`.env.example` lists every key by name.

The client only ever calls relative URLs (`/api/...`), so the same build works on any host.

## How it runs

- **Development** (`npm run dev`): Vite on 5380 serves the client with hot reload and forwards
  `/api` to the server on 3800, which restarts on file changes.
- **Production** (`npm run build`, then `npm start`): one Node process. Express answers `/api`
  and serves `client/dist` as static files; any other GET returns `index.html`, so deep links
  such as `/events` reach the client router. Unknown `/api` paths stay JSON 404s.

## Client routing

`react-router` in declarative mode (chosen 2026-10-17): the site needs nested layouts (one
header and footer around every page), active navigation links, route parameters
(`/info/<slug>`), guarded pages for accounts and admin, and a 404 page. A home-made router
would have to rebuild all of that; react-router is the maintained standard for React.

- `client/src/app/App.jsx` is the one route table; every route renders inside `Layout`
  (header, page, footer). Unknown paths render `NotFoundPage`.
- `client/src/app/navigation.js` is the one list of header and footer links.
- `main.jsx` supplies `BrowserRouter`; tests supply `MemoryRouter`.

## Info pages and user-written content

Info pages live in the database (`info_pages`: slug, title, Markdown body, draft/published,
order, last editor). The public sees only published pages (`/info`, `/info/<slug>`); a draft
answers 404 exactly like a missing page. Admins edit them at `/admin/info` (create, edit with
live preview, publish/unpublish, reorder); every change is audited.

**User-written text is never injected as HTML.** `client/src/components/Markdown.jsx` renders
Markdown with react-markdown, which builds React elements and drops raw HTML (`skipHtml`);
`javascript:` link targets are removed; external links open with `rel="noopener noreferrer"`.
The public page and the editor preview use the same component.

**First-start content:** when the table is empty, `server/src/info/seed.js` inserts the pages in
`server/src/info/seed/*.md` as **drafts**, for an admin to review and publish. The texts were
drafted only from the official Seasonal Tokens website, both whitepapers and the owner's info
sheet and farming guide, and each ends with its Sources list (2026-10-17). No contract address
is retyped anywhere (the pages link to the official site); `server/test/infoSeed.test.js` guards
these rules. Imprint and Privacy are drafts with `[TO BE FILLED BY OWNER]` placeholders.

## Events calendar

Events are rows in the database (`events`), editable at `/admin/events` without code changes
(decided 2026-10-16); every change is audited. Each has a rule — `weekly`, or `monthly_first`
(the first <weekday> of each month) — an ISO weekday (1 = Monday) and a start time **in UTC**,
plus optional duration, a channel text, an optional https link and an active flag. The public
`/api/events` returns only active events.

`shared/eventSchedule.js` turns the rules into the occurrences of one week, Monday to Sunday
**in the viewer's time zone**, and formats them in that zone (`/events` shows the local time,
the zone's name and the UTC time). Weeks that contain a daylight-saving change are 167 or 169
hours long; the module handles that and `shared/eventSchedule.test.js` pins it with the
European change of 25 October 2026.

First start: `server/src/events/seed.js` inserts the owner's weekly schedule (14 events, UTC,
checked against "ST Schedule.pdf" on 2026-10-17) when the table is empty.

## Games hub

Game cards are rows in `games`: name, short description, image, status (`available`,
`coming_soon`, `maintenance`), path under `/games/`, visibility (`everyone`, `members`,
`organisers`) and order. `/api/games` returns only the cards the viewer may see; only available
games get a Play link. Images are chosen from a fixed list of the site's own assets
(`shared/gameRules.js`), so no outside image is ever loaded. Admins edit cards at
`/admin/games`; every change is audited. First start adds "Seasonal Race" (coming soon,
`/games/race`, everyone); the race game itself stays in its own repository and is not connected
yet.

## Chat

**Actions over HTTP, live updates over WebSocket.** Sending, reporting and moderating are
ordinary `/api/chat` routes, so CSRF, access declarations, validation, rate limits and the
audit log apply unchanged. The WebSocket `/ws/chat` only pushes: a client subscribes to rooms it
may read and receives new messages and "hidden" notices. The upgrade is refused unless the
Origin is this site (`PUBLIC_ORIGIN`, or the request's own host), and it reuses the session
middleware to know who connects. In development Vite forwards `/ws` to the server.

- **Rooms** (`chat_rooms`) say who may read and who may write: `everyone` (guests too),
  `members` or `organisers`. First start: General (guests read and write), Seasonal Race
  (members), Organisers (organisers and admins), Announcements (everyone reads, organisers
  write). Admins edit rooms at `/admin/chat`; audited.
- **Guests** (decided 2026-10-17) write only where everyone may write (General). Their first
  message (or report) gives them a name like `Guest-7k2f` that nobody else holds at the same
  time (UNIQUE in `chat_guests`, retried on collision), kept in their session and shown with a
  Guest badge. Guests cannot post links (`containsLink`, `shared/chatRules.js`) and have a
  stricter message rate (2 per 10 s; members 5 per 10 s). Registered usernames may not start
  with "Guest-".
- **Messages** are plain text, at most 500 characters; only members' explicit http(s) links
  become links, with `rel="nofollow noopener noreferrer ugc"`.
- **Moderation** (organisers and admins, with 2FA): hide a message (gone for everyone else at
  once, still visible to moderators), mute its author for 10 minutes, 1 hour or 1 day, ban
  them from writing, lift a mute or ban, see reported messages. Staff cannot be muted or banned.
  Every action is audited. Anyone may report a message, counted once per account or guest; no
  IP address is stored.
- **Retention**: messages older than `CHAT_RETENTION_DAYS` (default 90) are deleted, and guest
  names unused for 30 days are released, at start and every six hours
  (`server/src/chat/retention.js`).

## Security headers

`server/src/http/securityHeaders.js` (helmet) sends a strict Content-Security-Policy on every
response: scripts, styles, fonts and connections only from this origin, images from this origin
or `data:` URLs, no plugins, no framing (`frame-ancestors 'none'`), no inline script or style.
Plus `nosniff`, `Referrer-Policy: same-origin` and helmet's other defaults. The browser smoke
test fails on any console error, which is where a CSP violation shows up.

## Folder layout

```
.github/workflows/ci.yml   CI: npm run verify
.claude/settings.json      agent permissions for this repository
client/                    React + Vite client
  index.html               HTML shell
  src/app/                 route table, layout, header, footer, navigation list
  src/api/http.js          the one fetch wrapper (JSON, ApiError)
  src/session/             session context (who is signed in), RequireUser guard
  src/components/          shared UI pieces (form fields, forms)
  src/admin/               admin area (/admin): layout, users, audit log, info editor; one section each
  src/components/Markdown.jsx  the one safe Markdown renderer
  e2e/                     Playwright browser tests; drawnBox.js measures drawn pixels,
                           opticalCentres.js defines each season motif's optical centre
  src/main.jsx             entry point
  src/pages/               one folder entry per page (component, CSS, test side by side)
  src/styles/              tokens.css (all design tokens), fonts.css, base.css
  src/assets/              logo, season marks, fonts (woff2)
  src/assets/seasons/source/  original season marks, input of build-season-marks.mjs
  src/test/setup.js        Vitest setup
server/
  src/index.js             entry point: config, app, listen
  src/app.js               Express app (routes); no listen, so tests drive it directly
  src/http/                cross-cutting HTTP: security headers, access (allow), CSRF,
                           sessions, rate limits, validation, error shape
  src/db/database.js       opens the database, applies every area's schema
  src/accounts/            accounts area: schema, user store, passwords, routes, bootstrap
  src/twofa/               two-factor area: TOTP, schema, store, routes, staff gate
  src/audit/               audit log: schema and the one recordAudit helper
  src/admin/               /api/admin routes (users, audit); areas add their own editors
  src/info/                info pages: schema, store, public and admin routes, seed (+ seed/*.md)
  src/events/              events: schema, store, public and admin routes, seed
  src/games/               games hub: schema, store, public and admin routes, seed
  src/chat/                chat: schema, store, viewer rules, routes, moderation, WebSocket hub,
                           sender rate limit, retention, seed
  test/helpers/testApp.js  app on a temporary database for tests (chat.js: chat helpers)
  src/config.js            environment configuration
  src/buildInfo.js         version and commit for /api/health
  test/                    Vitest tests
shared/                    rules used by server and client (accountRules.js, eventSchedule.js,
                           gameRules.js, chatRules.js)
scripts/
  dev.mjs                  npm run dev
  e2e.mjs                  npm run test:e2e (temporary database per run)
  create-dev-admin.mjs     npm run dev:admin (local admin via the bootstrap flow)
  build-season-marks.mjs   npm run marks:build (web-ready season marks)
  verify.mjs               npm run verify
docs/                      this file and the backlog
```

## Assets

Copied from the owner's Seasonal Token folder and renamed to lowercase:

| In the repo                            | Original file                                  |
| -------------------------------------- | ---------------------------------------------- |
| `assets/seasonal-entertainment.jpg`    | `seasonal_entertainment.jpg`                   |
| `assets/seasonal-tokens.svg` (favicon) | `Seasonal_Tokens-02.svg`                       |
| `assets/seasons/source/spring.svg`     | `Spring_Season-02.svg`                         |
| `assets/seasons/source/summer.svg`     | `Summer_Season-02.svg`                         |
| `assets/seasons/source/autumn.svg`     | `Autumn.svg`                                   |
| `assets/seasons/source/winter.svg`     | `Winter_Season-02.svg`                         |
| `assets/fonts/luxora-grotesk-*.woff2`  | the six `.otf` files, converted with fontTools |

Font weights: Book 400 (body), Regular 500, Bold 700, Heavy 900 (headings), Italic 400 italic,
Light Italic 300 italic. Book and Regular both carry weight 400 inside the files; Regular is
mapped to 500 so both remain usable.

### Season marks

**Rule (decided 2026-10-17):** the originals live, unchanged, in
`client/src/assets/seasons/source/`. The web-ready marks next to it
(`client/src/assets/seasons/{spring,summer,autumn,winter}.svg`) are generated from them by
`npm run marks:build` (`scripts/build-season-marks.mjs`) and never edited by hand. They are
square, optically centred and share one margin. Nothing on the page corrects them.

The originals draw only the motif (flower, sun, leaf, snowflake), no ring, and their natural
shape is not square (snowflake ≈ cos 30° as wide as tall). Their bounding box is centred on
the canvas, their optical centre is not: spring's star sat about 5 px and autumn's leaf about
6 px low in a 96 px ring. The optical centre of each motif is defined once, in
`client/e2e/opticalCentres.js`: spring the filled star (#C1CA55), summer the inner circle
(#E8956B), autumn the centroid of the leaf's drawn pixels, winter the snowflake hub (=
centroid, six-fold symmetric).

The script renders each original in Chromium and measures it with `client/e2e/drawnBox.js`
(the same code as the browser tests): its optical centre, and its farthest drawn point from
that centre. The largest motif sets one shared radius; each mark is then wrapped, paths
untouched, in one `<g transform="translate(..) scale(..)">` that puts its optical centre at
the centre of a square viewBox and scales it uniformly so its farthest point lies on that
radius. All four motifs therefore have the same size relative to the square. Finally SVGO
optimises the file with settings that keep the group and its transform and never replace
curves; the script prints the offsets and scales it applied and re-measures its own output.

The round ring around each mark is page CSS (`.landing__season` in `LandingPage.css`), in the
season colour, with explicit width and height (with `aspect-ratio` alone a tall motif once
stretched it oval). The mark simply fills the ring's inner area.

Checks: `client/src/assets/seasons/seasonMarks.test.js` (fast) verifies each web-ready file has
a square viewBox, one shared size and one translate + scale group.
`client/e2e/seasonMarks.spec.js` verifies on the page, at 360 px and 1280 px: each mark (ring
included) is round within 2 %; each optical centre is within 1 px of the ring centre; each
motif stays at least 1 px inside the ring. A new mark gets its original in `source/`, its
optical centre in `opticalCentres.js`, and a run of `npm run marks:build`.

## Planned areas

None of these exist yet. Each gets its own branch and backlog entry.

- **Accounts**: Discord and Telegram login; 2FA for organisers and admins.
- **Info pages**: content pages, edited by admins in the browser.
- **Games hub**: list of games; the race game connected here.
- **Chat**: community chat.
- **Bots**: Discord/Telegram bots and group roles.
- **Admin pages**: management screens, including an events calendar that is edited without
  code changes.

## Adding a new area or game

1. Open a branch and a backlog entry for it.
2. Server: add a router file per area (for example `server/src/routes/games.js`) mounted under
   `/api/<area>` in `app.js`, with its tests in `server/test/`.
3. Client: add the page(s) under `client/src/pages/`, styled only with tokens from
   `tokens.css`, and their routes in `client/src/app/App.jsx` (plus a link in
   `navigation.js` if it belongs in the header).
4. A game that lives in its own repository (like the race game) is connected from the games
   hub by link or embed; it keeps its own server and ports.
5. Extend tests (unit and, where a page is visible to users, the browser test), update this
   file and the backlog, run `npm run verify`.
