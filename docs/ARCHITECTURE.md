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
2026-10-17 because a registration form must never accept what the server refuses. Since
2026-10-18 it also holds the project's one cryptography helper, `shared/crypto.js` (libsodium,
`libsodium-wrappers-sumo` pinned to an exact version), used by the browser, the server tests and
the scripts, and `shared/cryptoFormat.js`, the shape checks the server applies (docs/AUTH.md).
Since 2026-10-23 also what the page and the server both say or work out: the not-financial-advice
wording (`disclaimer.js`), the season clock from the token contracts (`seasonClock.js`) and the
calls in the event lists (`callEntries.js`, used by "Up next" and the weekly recap), how a
price change reads (`priceChange.js`) and a recording's times and chapters (`chapterRules.js`).

## Data

One SQLite file (`DATABASE_PATH`, default `data/seasonal.db`; `data/` is gitignored),
opened by `server/src/db/database.js`. Each area owns one schema module of
`CREATE TABLE IF NOT EXISTS` statements (e.g. `server/src/accounts/schema.js`), applied at every
start, and one small data module (e.g. `userStore.js`). No ORM. Sessions live in the same file
(table `sessions`). Tests use a temporary database each and delete it. Accounts, sessions,
roles and the bootstrap are described in [AUTH.md](AUTH.md).

## Ports

The race game uses 5173 and 4173; this project stays clear of them.

| Port | What                                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| 3800 | Server (`npm start`, and the API behind `npm run dev`)                                       |
| 5380 | Vite dev server (`npm run dev`), forwards `/api` and `/ws` to 3800                           |
| 3810 | Server started by the Playwright browser tests                                               |
| 5390 | Vite dev server in front of 3810 during the browser tests (`SE_E2E_DEV_PROXY_PORT` moves it) |
| 7880 | LiveKit call server in development (`npm run dev:calls`)                                     |
| 7890 | LiveKit call server of the browser tests (ICE on 7891 TCP, 7892 UDP)                         |

## Runtime configuration

Read from the environment when the process starts, never baked into a build:

| Variable                            | Default                                       | Used by                                                                   |
| ----------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `HOST`                              | `127.0.0.1`                                   | server listen address                                                     |
| `PORT`                              | `3800`                                        | server listen port                                                        |
| `CLIENT_DIST`                       | `client/dist`                                 | folder of the built client the server serves (`assets/` cached a year)    |
| `COMMIT_SHA`                        | output of `git rev-parse`                     | commit reported by `/api/health`                                          |
| `CLIENT_PORT`                       | `5380`                                        | Vite dev server port                                                      |
| `API_ORIGIN`                        | `http://127.0.0.1:3800`                       | where the Vite dev server forwards `/api` and `/ws`                       |
| `NODE_ENV`                          | (unset)                                       | `production`: Secure cookies, no dev defaults (DEPLOYMENT.md)             |
| `DATABASE_PATH`                     | `data/seasonal.db`                            | SQLite file                                                               |
| `SESSION_SECRET`                    | random per start (dev)                        | signs session cookies; required in production                             |
| `SECRET_ENCRYPTION_KEY`             | public development key (dev)                  | encrypts 2FA secrets at rest; required in production (AUTH.md)            |
| `BOOTSTRAP_TOKEN`                   | (unset)                                       | one-time first-admin creation (AUTH.md)                                   |
| `PUBLIC_ORIGIN`                     | from the Host header (required in production) | own origin for CSRF/WebSocket origin checks                               |
| `TRUST_PROXY`                       | `0` (must be set explicitly in production)    | number of reverse proxies in front                                        |
| `COOKIE_SECURE`                     | `true` in production                          | Secure session cookie                                                     |
| `CSRF_STRICT`                       | `true`                                        | refuse state changes without Origin/Referer                               |
| `BCRYPT_COST`                       | `12`                                          | password hashing cost (4–15)                                              |
| `REQUIRE_STAFF_2FA`                 | `true`                                        | organisers/admins must use 2FA; `false` only outside production           |
| `CHAT_RETENTION_DAYS`               | `90`                                          | chat messages older than this are deleted                                 |
| `CHAT_MAX_CONNECTIONS_PER_MEMBER`   | `5`                                           | open live chat connections per member account (docs/CHAT.md)              |
| `CHAT_MAX_GUEST_CONNECTIONS_PER_IP` | `20`                                          | open live chat connections per address for guests (docs/CHAT.md)          |
| `MEDIA_DIR`                         | `data/media`                                  | chat stickers, GIFs and preview images, served at `/media`                |
| `LINK_PREVIEWS`                     | `true`                                        | `false` switches chat link previews off                                   |
| `CALLS_URL`                         | (unset: Calls off)                            | call service origin, `wss://...` (docs/CALLS.md)                          |
| `CALLS_API_KEY`                     | (unset)                                       | call service API key; set with the other two or none                      |
| `CALLS_API_SECRET`                  | (unset)                                       | call service API secret; production: no dev pair, 32+ chars               |
| `CALLS_RECORDINGS_DIR`              | (unset: recording off)                        | the folder call recordings land in (docs/CALLS.md, "Recording")           |
| `CALLS_EGRESS_OUTPUT_DIR`           | the same as `CALLS_RECORDINGS_DIR`            | that folder as the egress service sees it                                 |
| `BACKUP_DIR`                        | (unset)                                       | where `scripts/backup.mjs` writes backups (DEPLOYMENT.md)                 |
| `BACKUP_ENCRYPTION`                 | `on`                                          | encrypt backups with age (`off`: plain folders)                           |
| `BACKUP_RECIPIENT`                  | (unset; required while encryption is on)      | the owner's age public key (`age1…`) the backups are for                  |
| `PRICE_BOT_DB`                      | (unset: prices off)                           | the price bot's `snapshots.db`, read-only (docs/BOTS.md)                  |
| `EVENT_BOT_DB`                      | (unset: bot events off)                       | the event bot's database, read-only (docs/BOTS.md)                        |
| `PRICE_BOT_MINING_RATES`            | (unset: no fair price, no mining times)       | the price bot's `mining_rates.json`, read-only (docs/BOTS.md)             |
| `COINGECKO_API_KEY`                 | (unset: ETH, POL, BTC not connected)          | CoinGecko Demo key: the server fetches ETH/POL/BTC history (docs/BOTS.md) |

The server loads `.env` from the repository root if present; real environment variables win.
`.env.example` lists every key the server reads, by name with a comment and no value;
`server/test/envExample.test.js` fails when one is missing or carries a value. (It is the one
`.env.*` file in the repository: `.gitignore` excludes the others, and the agent permissions in
`.claude/settings.json` may read `.env.example` but no other `.env` file.)

The client only ever calls relative URLs (`/api/...`), so the same build works on any host.

## How it runs

- **Development** (`npm run dev`): Vite on 5380 serves the client with hot reload and forwards
  `/api` and `/ws` to the server on 3800, which restarts on file changes. The proxy passes the
  browser's `Host` header on unchanged (`changeOrigin: false`), so the CSRF and WebSocket origin
  checks compare against `http://localhost:5380`, the origin the browser really sends; no
  development exception exists in those checks. `client/e2e/devProxy.spec.js` guards this path.
- **Production** (`npm run build`, then `npm start`): one Node process. Express answers `/api`
  and serves `client/dist` as static files; any other GET returns `index.html`, so deep links
  such as `/events` reach the client router. Unknown `/api` paths stay JSON 404s.

## Client routing

`react-router` in declarative mode (chosen 2026-10-17): the site needs nested layouts (one
app shell around every page), active navigation links, route parameters
(`/info/<slug>`), guarded pages for accounts and admin, and a 404 page. A home-made router
would have to rebuild all of that; react-router is the maintained standard for React.

- `client/src/app/App.jsx` is the one route table; every route renders inside `Layout`, the
  app shell (sidebar and main column, docs/DESIGN.md). Unknown paths render `NotFoundPage`.
- `client/src/app/navigation.js` is the one definition of the navigation: sidebar items,
  who sees the Admin item, legal links, admin sections.
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
`server/src/info/seed/*.md`: the ten content pages and the Disclaimer (2026-10-23, linked as
"Not financial advice" from every page) **published**, Imprint and Privacy as **drafts**
(`SEED_DRAFTS`). The texts were drafted only from the official Seasonal Tokens
website, both whitepapers and the owner's info sheet and farming guide, and each ends with its
Sources list (2026-10-17); the ten content pages were checked against the official sources and
published (decided 2026-10-22). No contract address is retyped anywhere (the pages link to the
official site); `server/test/infoSeed.test.js` guards these rules. Imprint and Privacy stay
drafts with `[TO BE FILLED BY OWNER]` placeholders until the owner's details and a legal review
are in.

## Events

Events come **only from the owner's event bot** (decided 2026-10-20; docs/BOTS.md): the site
reads its occurrences read-only and has no events table or editor of its own (the old `events`
table is dropped on start, `server/src/db/database.js`). `/events` shows one week, Monday to
Sunday **in the viewer's time zone**, and the home page's "Up next" the next two occurrences;
both list the site's live and planned calls beside them by time (docs/CALLS.md, "In the event
lists").
`shared/localWeek.js` finds the local week and formats days and times in that zone (`/events`
shows the local time, the zone's name and the UTC time). Weeks that contain a daylight-saving
change are 167 or 169 hours long; `shared/localWeek.test.js` pins that with the European change
of 25 October 2026.

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

**One module on each side** (docs/CHAT.md): the client's `<ChatPanel>` (`client/src/chat/`, one
public entry `index.js`, styles under `.se-chat`, one shared WebSocket per page) can be placed on
any page; the server's chat area is mounted with one call, `mountChat()` (`server/src/chat/
mount.js`). The `/chat` page is a heading and one full panel with room tabs. Tests enforce both
boundaries.

**Actions over HTTP, live updates over WebSocket.** Sending, reporting and moderating are
ordinary `/api/chat` routes, so CSRF, access declarations, validation, rate limits and the
audit log apply unchanged. The WebSocket `/ws/chat` only pushes: a client subscribes to rooms it
may read and receives new messages and "hidden" notices. The upgrade (`server/src/chat/socket.js`)
is refused unless the Origin is exactly this site's origin, scheme included — the same
`selfOrigin()` rule as the CSRF guard (`PUBLIC_ORIGIN`, or the request's own scheme and host).
It reuses the session middleware to know who connects; `server/src/chat/hub.js` holds the
subscriptions and pushes. In development Vite forwards `/ws` to the server.

**One rule for HTTP and WebSocket** (`server/src/chat/viewer.js`): an organiser or admin who
still has to set up the required 2FA counts as a member in the chat — no Organisers room, no
writing in Announcements, no hidden messages, no moderation. A socket's rights are never cached:
every subscribe and every push re-checks the account as it is now (deleted, locked, older
session epoch, role, 2FA), and a socket that may no longer read a room stops receiving it.
Logout closes that session's sockets; a role, lock or password change by an admin, an own
password change and turning 2FA on or off close the account's other sockets at once.

- **Rooms** (`chat_rooms`) say who may read and who may write: `everyone` (guests too),
  `members` or `organisers`. First start: General (guests read and write), Seasonal Race
  (members), Organisers (organisers and admins), Announcements (everyone reads, organisers
  write). Admins edit rooms at `/admin/chat`; audited. A separate **guest-writable** flag
  decides whether guests may write; only General has it, new rooms start without it, and it can
  be set only where everyone may read and write (enforced in `server/src/chat/viewer.js`, not
  just by the seed). Databases from before the flag get it on start (`migrateChat`): rooms
  everyone could write in keep guest writing.
- **Guests** (decided 2026-10-17) write only in guest-writable rooms (General). Their first
  message (or report) gives them a name like `Guest-k7m2qa` (six base32 characters, about a
  billion names) that nobody else holds at the same time (UNIQUE in `chat_guests`, retried on
  collision; if no name is free the answer is `503 guest_names_exhausted`, never a 500), kept in
  their session and shown with a Guest badge. Guests cannot post links (`containsLink`,
  `shared/chatRules.js`) and have a stricter message rate (2 per 10 s; members 5 per 10 s).
  Because a guest can clear cookies, guests are also limited **per IP address**, in memory only
  (no IP is stored): 20 guest messages per minute (`rateLimits.chatGuestPost`) and 20 new guest
  names per hour (`rateLimits.chatNewGuest`). Registered usernames may not start
  with "Guest-".
- **Messages** are plain text, at most 500 characters; only members' explicit https links
  become links, with `rel="nofollow noopener noreferrer ugc"`. Links are **https only**: a
  member's message with a plain `http://` link is refused (`400 https_only`, enforced
  2026-10-17 to match the stated rule; until then such links were accepted).
- **Emojis** (everyone, guests too) are plain Unicode text in the message. The picker next to the
  message field (`client/src/chat/ChatPicker.jsx`) uses a compact built-in list of about 150
  emojis with English names (`client/src/chat/emojis.js`), chosen 2026-10-17 over a picker
  library: no dependency, no emoji data download, nothing from a CDN, so the strict CSP stays.
  Bundle cost: +4.7 kB JavaScript (+1.9 kB gzip) and +0.8 kB CSS (+0.15 kB gzip).
- **Stickers and GIFs** (decided 2026-10-17) come only from the site's **own library**, managed
  by admins at `/admin/chat-media`; no outside GIF service. **Members only**: guests write text
  and emojis, and their picker shows just an Emoji tab with "Log in to send stickers and GIFs".
  **A message is optional text plus at most one attachment** (decided 2026-10-17): choosing a
  sticker or GIF puts it small above the message field with an ×; Send sends text and
  attachment together (request `{ body, attachment: { type, itemId } }`). The attachment names a
  library item **by id**, never a URL; the server accepts it only from a member, for an active
  item in an active pack of that kind, where the room allows writing; the text keeps every text
  rule (https only, link preview), and the message counts once towards the sender's rate limit
  (`server/src/chat/messageInput.js`).
  If the item or its pack is later deactivated or deleted, old messages show "Media removed".
  Stickers show at 128 px, GIFs at most 240 px wide; every image has alt text, and a credit shows
  on hover or a tap.
- **The library** (`server/src/media/`): tables `media_packs` (name, kind sticker|gif, order,
  active) and `media_items` (pack, name, alt text, credit, file, type, size, active). Uploads are
  admin-only (with 2FA) and checked by **one validator** (`imageCheck.js`, also used for link
  preview images): the real type from the first bytes (never the name or the claimed type),
  the header readable and the first frame fully decodable by sharp, and per-kind limits from
  `config.media` — stickers WebP or PNG, at most 512 KB and 1024 px per side; GIF packs GIF or
  animated WebP, at most 3 MB and 640 px per side. Files are stored in `MEDIA_DIR` (default
  `data/media`, gitignored) under generated names (`<32 hex>.<ext>`) and served from this origin
  at `/media/...` with their type, `nosniff` and a one-year immutable cache; a missing file is a
  404, never the client page. Every library change is audited.
- **Starter pack**: on first start (empty library) `server/src/media/seed.js` turns
  `server/seeds/chat-media/` (made from the owner's own files; sources and credits in its README)
  into four packs: Stickers "Seasons", "Coins" (the silver coins credited to Foxeane),
  "Seasonal Tokens", and GIFs "Seasonal Tokens". The "library empty" check is repeated inside the
  write, so two starts at once (a restarting dev server) cannot seed twice.
- **Link previews** (decided 2026-10-17, `server/src/previews/`): when a member's text message
  contains an https link, the **server** previews the first one in the background and pushes a card
  (`{ type: "preview" }`) to the room; the message itself is never delayed, and a failed fetch just
  means no card. Title, description and site name come from Open Graph, then Twitter-card tags, then
  `<title>`/description, as **plain text** with capped lengths (120 / 300 / 60). The image is
  downloaded by the server, checked by the library's validator (JPEG, PNG, WebP or GIF by content,
  at most 1 MB and 50 megapixels, `config.imageMaxPixels`), scaled down to at most 480 px wide,
  stored as WebP under `MEDIA_DIR/previews/` and served from this origin, so **viewers' browsers
  never contact the linked site** and the CSP stays unchanged. Results are cached per URL for 24 h
  (failures too), one fetch per URL at a time; at most 30 fetches per member per hour and 60 per
  minute overall (`config.linkPreviews`). `LINK_PREVIEWS=false` switches previews off. Previews
  nobody uses any more are deleted with their image by the retention job.
- **Fetch safety** (`server/src/previews/safeFetch.js`, `ipPolicy.js`), against server-side
  request forgery: https and port 443 only, no credentials in the URL; the server resolves the
  name itself and **every** answer must be a public address — private, loopback, link-local
  (cloud metadata), carrier-grade NAT, multicast, reserved and documentation ranges, IPv6
  unique-local, link-local, IPv4-mapped, NAT64, 6to4 and Teredo are refused (address literals
  too); it then connects to exactly that address (no second lookup) with the TLS certificate
  checked against the host name; at most 3 redirects, each checked the same way; one 5 s
  deadline for page and image together (DNS included); HTML capped at 1 MB and only `text/html`
  parsed; a fixed User-Agent, no cookies, no credentials. Tests run on a pretend internet
  (`server/test/helpers/previewNet.js`), never the real one.
- **Previews and moderation**: organisers and admins can remove a message's preview for
  everyone (audited, `chat.preview_remove`). A reported message shows its preview to
  moderators only until a moderator marks the reports reviewed ("Keep (reviewed)" on the admin
  chat page, audited `chat.report_review`).
- **Moderation** (organisers and admins, with 2FA): hide a message (gone for everyone else at
  once, still visible to moderators), mute its author for 10 minutes, 1 hour or 1 day, ban
  them from writing, lift a mute or ban, see reported messages. Staff cannot be muted or banned.
  Every action is audited. Anyone may report a message, counted once per account or guest; no
  IP address is stored.
- **File uploads** (decided 2026-10-17, `server/src/uploads/`): members (not guests) attach one
  image (JPG, PNG, WebP, GIF) or PDF to a message with **Attach file**. The file is uploaded first
  (`POST /api/chat/uploads`, raw body, name in the query) and sent with the message as
  `{ type: 'file', uploadId }` — only the uploader's own, not yet sent upload. The real type comes
  from the content (the media validator; PDF by its `%PDF-` signature); at most 10 MB per file and
  50 MB per member per 24 hours (`config.uploads`), images at most 50 megapixels (width x height,
  read from the header before anything is decoded, `config.imageMaxPixels`, decided 2026-10-23), 10
  uploads a minute (`rateLimits.chatUpload`). Images are re-encoded: turned upright by their
  orientation tag, every metadata block (EXIF with GPS, XMP, comments) dropped, animation kept, plus
  a thumbnail at most 480 px wide. Files sit in `MEDIA_DIR/uploads/` under generated names; the
  original name survives only as cleaned-up display text (100 characters).
- **Files in direct messages** (2026-10-22, `server/src/directFiles/`): encrypted in the
  browser before upload, stored as ciphertext in `MEDIA_DIR/direct/`, served to the two members
  only; a reporter's shared copy in `MEDIA_DIR/direct-reports/` for moderators (docs/CHAT.md,
  "Files in direct messages").
- **Uploaded files are not public.** The public `/media` mount serves only exact library and
  preview names, never `uploads/`. Files come from `GET /api/chat/files/<id>/<thumb|full|
download>`, which applies the chat's own rule every time: the viewer must be able to read the
  message's room; a hidden message's file goes to moderators only; a file not yet sent goes to
  its uploader only; anything else is the same 404 as an unknown file (`Cache-Control: private,
no-store`). PDFs are only a download: `Content-Disposition: attachment`, `nosniff` and
  `Content-Security-Policy: default-src 'none'; sandbox`; the site never shows them itself.
  Moderators' **Remove file** deletes the files from disk and leaves "File removed" (audited,
  `chat.file_remove`). Reported messages keep their file.
- **Unread counters** (docs/CHAT.md, "Unread counters"): read markers per member, room and
  conversation (`chat_reads`); `GET /api/chat/unread` feeds one client store, kept live by
  "activity" and "read" pushes (`hub.notifyReaders`, `hub.sendToUser`).
- **Online status** (docs/CHAT.md, "Online status"): `hub.onlineUserIds()` is the one source of
  presence and honours each member's "Show when I'm online" (`users.show_online`).
- **@mentions** (docs/CHAT.md): `server/src/chat/mentions.js` stores who a room message mentions
  (`chat_mentions`); the counters add each room's unread mentions.
- **Member search** (docs/CHAT.md, "Finding a member"): `GET /api/chat/members`, its own rate
  limit; `server/src/db/like.js` escapes LIKE wildcards for it and the admin user search.
- **Direct messages** (docs/CHAT.md, "Direct messages"): end-to-end encrypted between members;
  `server/src/chat/directRoutes.js` (`/api/chat/direct`) stores and relays ciphertext only, pushed
  to both members' sockets (`hub.sendToUser`); the client's `DirectPanel` (chat module) shows them
  in the drawer's and the `/chat` page's Direct tab.
- **Reporting a direct message** (docs/CHAT.md): `server/src/chat/directReportRoutes.js`; copies
  of private messages reach moderators only when the reporter ticks to share them; every view of
  them is audited.
- **Keys** (docs/CHAT.md, "Keys and the recovery code"): `server/src/keys/` (`/api/keys`) holds
  members' public keys and their private keys sealed in the browser, with the optional recovery
  seal; the client side is `client/src/keys/` (KeyProvider, the unlocked copy in IndexedDB, the
  recovery-code dialog, the account page's "Private messages").
- **Favourites** (docs/CHAT.md, "Favourites"): members' favourite rooms and members,
  `/api/chat/favourites`, keyed on the session's account only; rows cascade with the account.
- **Retention**: messages older than `CHAT_RETENTION_DAYS` (default 90) are deleted with their
  uploaded files, files whose message was removed in any other way and uploads never sent
  within an hour go too (no orphans), unused link previews after the cache time, and guest
  names unused for 30 days are released, at start and every six hours
  (`server/src/chat/retention.js`, `runChatRetention`).

## Security headers

`server/src/http/securityHeaders.js` (helmet) sends a strict Content-Security-Policy on every
response: scripts, styles, fonts and connections only from this origin, images from this origin
or `data:` URLs, no plugins, no framing (`frame-ancestors 'none'`; only the embedded chat
under `/embed/` may be framed, by this origin alone: docs/EMBED.md), no inline script or
style, no JavaScript `eval`. `script-src` also has `'wasm-unsafe-eval'` (added and confirmed by the
owner 2026-10-18): it allows
compiling WebAssembly only, which the browser's cryptography needs (libsodium, `shared/crypto.js`,
docs/AUTH.md); the module itself is a same-origin file.
Plus `nosniff`, `Referrer-Policy: same-origin` and helmet's other defaults. The browser smoke
test fails on any console error, which is where a CSP violation shows up.
With calls configured, `connect-src` also holds the call service's origin (`CALLS_URL` and the
same host over https) and nothing else; `Permissions-Policy` allows camera, microphone and
screen capture for this origin only (docs/CALLS.md, "Security headers").

## Folder layout

```
.github/workflows/ci.yml   CI: npm run verify
.claude/settings.json      agent permissions for this repository
client/                    React + Vite client
  index.html               HTML shell
  src/app/                 route table, app shell (Layout, Sidebar, AccountCard), chat drawer
                           (ChatDrawer, RoomPicker, its remembered state), icons, navigation
                           list, never-throwing browser storage
  src/api/http.js          the one fetch wrapper (JSON, ApiError)
  src/session/             session context (who is signed in), RequireUser guard, credentials
                           (password -> auth key and wrapping key, docs/AUTH.md) and the
                           password-hashing Web Worker that derives them off the main thread
  src/components/          shared UI pieces (form fields, forms, the busy submit button)
  src/chat/                the chat module: <ChatPanel> (index.js is its only entry), live
                           connection, composer, picker, messages, styles (docs/CHAT.md)
  src/devPages/            test-only pages, routed by the Vite dev server only (chat panels,
                           the embedded chat's demo)
  src/embed/               the embedded chat for iframes (/embed/chat) on this site and on
                           approved other sites, its postMessage API, the login popup
                           (/embed-login) and the in-memory embed token (docs/EMBED.md)
  src/prices/              coin prices (the price bot, CoinGecko via the server): the /info/prices
                           page, the hand-built SVG chart for one coin or several, the coin
                           choice, fair price, converter, formats (docs/BOTS.md)
  src/brand/               the SE style's brand pieces: which logo image is which (brand.js),
                           the section page header with its quarter, the login card's logo,
                           the banners' season pattern (docs/DESIGN.md)
  public/brand/            the logo, emblem, quarters and season pattern as WebP, made by
                           scripts/build-brand-images.mjs (docs/DESIGN.md, "Brand images")
  src/admin/               admin area (/admin): layout, users, audit log, info editor; one section each
  src/components/Markdown.jsx  the one safe Markdown renderer
  e2e/                     Playwright browser tests; drawnBox.js measures drawn pixels,
                           opticalCentres.js defines each season motif's optical centre
  src/main.jsx             entry point
  src/pages/               one folder entry per page (component, CSS, test side by side)
  src/styles/              tokens.css (all design tokens, light and dark), fonts.css, base.css
  src/theme/               light/dark theme: rule, provider, toggle (docs/DESIGN.md)
  src/calls/               community calls: /calls list, call form and card, LIVE badge,
                           the sidebar's calls summary, a planned call's actions (calendar
                           file, reminder), the members' reminder notices; the call page's parts (stage, speaker
                           tiles, listeners, controls, media), its live connection
                           (useCallRoom, livekit-client) and its rules (stageModel); the
                           recording question, a recording with its player and chapters
                           (RecordingItem, RecordingChapters; the archive page is
                           pages/RecordingsPage.jsx)
  src/keys/                a member's key pair in the browser: provider, device copy
                           (IndexedDB), unlock, recovery code, unlocking a new device from
                           an unlocked one (docs/CHAT.md, AUTH.md)
  src/notify/              browser notifications while the site is open: permission, the
                           switches, mentions, direct messages, the weekly recap (docs/CHAT.md)
  src/games/               the games hub's card images
  public/theme-init.js     sets the theme before the first paint (external: strict CSP)
  src/assets/              logo, season marks, fonts (woff2)
  src/assets/seasons/source/  original season marks, input of build-season-marks.mjs
  src/test/setup.js        Vitest setup
  src/test/                test helpers: mockApi.js (fixed API answers), fakeSocket.js
                           (stand-in WebSocket; the only one, every test uses it), renderApp.jsx
server/
  src/index.js             entry point: config, app, listen
  src/app.js               Express app (routes); no listen, so tests drive it directly
  src/http/                cross-cutting HTTP: security headers, access (allow), CSRF,
                           sessions, rate limits, validation, error shape
  src/db/database.js       opens the database, applies every area's schema and migrations
  src/db/addColumns.js     adds columns to older databases (each area's migrate function)
  src/accounts/            accounts area: schema, user store, passwords, routes (login:
                           loginRoutes.js, pre-login and login), credentials, bootstrap
  src/twofa/               two-factor area: TOTP, schema, store, routes, staff gate
  src/keys/                members' keys: public keys, sealed private keys, recovery seal
  src/audit/               audit log: schema and the one recordAudit helper
  src/admin/               /api/admin routes (users, audit); areas add their own editors
  src/info/                info pages: schema, store, public and admin routes, seed (+ seed/*.md)
  src/games/               games hub: schema, store, public and admin routes, seed
  src/chat/                chat area, mounted by mount.js (the only entry for the rest of the
                           server): schema, store, messages and what may be sent, viewer rules,
                           routes, moderation, WebSocket endpoint (socket.js) and hub, sender
                           rate limit, retention, seed
  src/media/               chat media library: schema, store, image validator, files on disk,
                           picker and admin routes, first-start seed
  src/previews/            chat link previews: safe fetching (SSRF rules), meta parsing, cache,
                           the preview service, moderators' removal route; fetchImage.js, also
                           used for the event bot's images
  src/uploads/             chat file uploads: schema, store, processing (type, metadata,
                           thumbnails), access-checked serving, moderators' removal
  src/directFiles/         files in direct messages: ciphertext only, schema, store, routes
                           (the two members; a reporter's shared copy for moderators)
  src/recap/               the weekly recap: its text, its sources, the Monday job, the
                           admins' "Post recap now" (docs/CHAT.md, "Weekly recap")
  src/backup/              backup and restore of the database and media (the scripts'
                           library; DEPLOYMENT.md)
  seeds/chat-media/        the starter stickers and GIFs (owner's own files, README credits)
  test/helpers/testApp.js  app on a temporary database for tests (chat.js: chat helpers,
                           chatSocket.js: a listening server and WebSocket clients)
  src/config.js            environment configuration
  src/productionConfig.js  what production refuses to start with (docs/DEPLOYMENT.md)
  src/secretKey.js         the key that encrypts 2FA secrets at rest (SECRET_ENCRYPTION_KEY)
  src/calls/               community calls (docs/CALLS.md): call service configuration, the
                           call service adapter, schema, store, participants, grants and join
                           tokens, spotlight rule, routes (management, join, stage, spotlight,
                           calendar file and reminders), ending a call, the stale-call job and
                           the reminder job, the link to a bot event (eventLink.js),
                           recordings with their length and chapters and the archive
                           (recordings.js, chapters.js, recordingRoutes.js, chapterRoutes.js)
  src/settings/            admin-editable site settings: definitions, store, admin routes
  src/embed/               the chat on approved other sites: the approved list (a setting),
                           embed tokens, their route allow-list, routes (docs/EMBED.md, AUTH.md)
  src/reference/           ETH, POL and BTC prices from CoinGecko: schema, the API call, the daily
                           and hourly job, public routes (docs/BOTS.md, "Reference prices")
  src/bots/                the owner's bots' databases, read-only: prices, event occurrences,
                           public routes with a cache, the events' images (fetched by the
                           server); fixtures.js and fixtureNetwork.js: fake development data
                           and its image host (docs/BOTS.md)
  src/buildInfo.js         version and commit for /api/health
  test/                    Vitest tests
shared/                    rules used by server and client (accountRules.js, localWeek.js,
                           gameRules.js, chatRules.js, disclaimer.js, seasonClock.js,
                           callEntries.js, priceChange.js, chapterRules.js), crypto.js and
                           cryptoFormat.js
scripts/
  dev.mjs                  npm run dev
  e2e.mjs                  npm run test:e2e (temporary database per run)
  create-dev-admin.mjs     npm run dev:admin (local admin via the bootstrap flow; rewrites
                           DEV-ADMIN.txt's 2FA part from the stored secret, never changing it)
  build-bot-fixtures.mjs   npm run dev:bot-fixtures (fake bot databases in data/bot-fixtures/)
  build-season-marks.mjs   npm run marks:build (web-ready season marks)
  build-brand-images.mjs   one-off: the brand images in client/public/brand/ from the owner's
                           logo file (docs/DESIGN.md, "Brand images")
  verify.mjs               npm run verify
  calls-dev.mjs            npm run dev:calls (LiveKit in development mode)
  calls-binary.mjs         the pinned LiveKit binary, checksum-checked, in .calls-bin/
  backup.mjs, restore.mjs  nightly backup (encrypted with age) and restore
                           (server/src/backup/; DEPLOYMENT.md)
  bootstrap-admin.mjs      the first admin of a running production site
deploy/site/               the site for a server: Dockerfile, docker-compose.yml (site + Caddy),
                           Caddyfile, systemd timers (docs/DEPLOYMENT.md)
deploy/pc/                 the owner's PC: fetches the encrypted backups (PowerShell, sftp)
deploy/calls/              the call service for a server: livekit.yaml, docker-compose.yml,
                           the optional recording add-on (docker-compose.recording.yml)
docs/                      this file, the backlog, and one file per area (AUTH, BOTS, CHAT,
                           CALLS, DESIGN, EMBED) plus SCALING (the staged plan for growing beyond one
                           VPS) and DEPLOYMENT (the runbook for the VPS)
```

## Assets

The logo images (`client/public/brand/`) are cut from the owner's logo by
`scripts/build-brand-images.mjs`; their sources and crop boxes are in docs/DESIGN.md, "Brand
images". Copied from the owner's Seasonal Token folder and renamed to lowercase:

| In the repo                            | Original file                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `assets/seasonal-tokens.svg` (favicon) | `Seasonal_Tokens-02.svg`                                                              |
| `assets/seasons/source/spring.svg`     | `Spring_Season-02.svg`                                                                |
| `assets/seasons/source/summer.svg`     | `Summer_Season-02.svg`                                                                |
| `assets/seasons/source/autumn.svg`     | `Autumn.svg`                                                                          |
| `assets/seasons/source/winter.svg`     | `Winter_Season-02.svg`                                                                |
| `assets/fonts/luxora-grotesk-*.woff2`  | five of the `.otf` files, converted with fontTools (Heavy dropped 2026-10-21: unused) |

Font weights: Book 400 (body), Regular 500, Bold 700 (also headings), Italic 400 italic,
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

On the home page each mark sits in a white circle on its season's price tile
(`.price-tile__mark` in `priceTiles.css`, 48px in 62px), with explicit width and height. The
mark simply fills its box; nothing corrects it.

Checks: `client/src/assets/seasons/seasonMarks.test.js` (fast) verifies each web-ready file has
a square viewBox, one shared size and one translate + scale group.
`client/e2e/seasonMarks.spec.js` verifies on the page, at 360 px and 1280 px: each tile's circle
is round within 2 %; each optical centre is within 1 px of the circle centre; each motif stays
at least 1 px inside the circle. A new mark gets its original in `source/`, its
optical centre in `opticalCentres.js`, and a run of `npm run marks:build`.

## Planned areas

Still to come (docs/BACKLOG.md part one): logging in with Discord or Telegram, group
roles from those groups, and the race game connected to the games hub. Each gets its own
branch and backlog entry.

## Adding a new area or game

1. Open a branch and a backlog entry for it.
2. Server: add the area's folder with its router (for example `server/src/games/routes.js`),
   mounted under `/api/<area>` in `app.js`, with its tests in `server/test/`.
3. Client: add the page(s) under `client/src/pages/`, styled only with tokens from
   `tokens.css`, and their routes in `client/src/app/App.jsx` (plus a link in
   `navigation.js` if it belongs in the sidebar).
4. A game that lives in its own repository (like the race game) is connected from the games
   hub by link or embed; it keeps its own server and ports.
5. Extend tests (unit and, where a page is visible to users, the browser test), update this
   file and the backlog, run `npm run verify`.
