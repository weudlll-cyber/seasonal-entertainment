# Backlog

An entry moves from part one to part two only when its branch is merged into `master`.

## PART ONE — open

- **File uploads in direct messages** — open. Left out of v1 (decided 2026-10-18): an uploaded
  file would have to be encrypted in the browser too.
- **Link previews in direct messages** — open. Left out of v1: the server would have to see the
  link to fetch it; links are plain clickable links.
- **Telegram-login recovery code handling** — open (decided direction 2026-10-17). Recovery codes
  are to apply to future Telegram logins too: such an account has no password to derive a
  wrapping key from (docs/AUTH.md).
- **Unlock a new device by confirming it on an already logged-in device** — unconfirmed proposal,
  not decided: instead of the password or the recovery code, a device that is already unlocked
  hands the private key over to the new one.
- **Operating-system notifications for mentions and direct messages** — unconfirmed proposal,
  not decided.
- **Uploads and uploaded images in the chat on other sites** — open. With an embed token,
  uploading is refused (decided scope), and uploaded images of members-only rooms do not show
  there: an image request cannot carry the token. Would need short-lived signed file links.
- **Guests writing in the chat on other sites** — open. A guest name is kept in a cookie, which
  other sites' frames do not get; guests can read there but not write.
- **Real sites to approve for the chat embed** — open, the owner's word: which game sites go on
  Admin → Embedding once the site is live (only exact `https://` origins).
- **Age key pair for the backups** — open, at deployment: the owner creates it on the PC
  (docs/DEPLOYMENT.md, "Backups"); the VPS gets only the public key.
- **Event bot admin page inside the site for admins without a second login** — open, waits for
  a change in the bot project: the bot page skips its own login when the site's server supplies
  the bot token, and its API paths can sit under a path prefix (today it calls absolute
  `/api/...`, which collide with the site's `/api`).
- **Site and bots on the same VPS** — open, the owner's word: reading the bots' files through
  read-only mounts assumes it (docs/DEPLOYMENT.md, "The owner's bots").
- **A ratio view between the seasons** — unconfirmed proposal, not decided (e.g. Spring priced
  in Summer).
- **Call recording** — unconfirmed proposal, not decided. Calls are not recorded (privacy draft).
- **Linking calls to events** — unconfirmed proposal, not decided: an event (now kept in the event
  bot) could carry its call, and a call its event.
- **Login with Discord or Telegram** — open. Accounts use a username and password, with 2FA
  required for organisers and admins (closed: SE-NIGHT-1 pieces 2 and 3); logging in with a
  Discord or Telegram account is not built (for Telegram's recovery codes see above).
- **Group roles** — open: site roles tied to Discord or Telegram groups are not built. The bots'
  data is shown (prices, events: SE-NIGHT-3 and SE-BOTS-2).
- **Race-game connection** — open: the games hub lists the race game as "coming soon"; the game
  lives in its own repository and is not connected to the site yet.
- **VPS deployment** — open, the owner's word: prepared (SE-NIGHT-2 part 7: image, compose with
  Caddy, backups, runbook in docs/DEPLOYMENT.md); the deployment itself waits for the owner's
  domains, VPS access and the backup key pair made on the owner's PC (backups go there, decided
  2026-10-19).

## PART TWO — closed

- **Security check (SE-NIGHT-4 piece 4)** — closed by SE-NIGHT-4 piece 4 (`feat/se-night-4`,
  not merged yet): no known vulnerabilities (npm audit), react-router 8.4.0 → 8.5.0; salt
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
- **Deployment preparation for the Contabo VPS** — closed by SE-NIGHT-2 part 7 (PR #7, merged
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
