# Backlog

An entry moves from part one to part two only when its branch is merged into `master`.

## PART ONE — open

- **File uploads in direct messages** — open. Left out of v1 (decided 2026-10-18): an uploaded
  file would have to be encrypted in the browser too.
- **Link previews in direct messages** — open. Left out of v1: the server would have to see the
  link to fetch it; links are plain clickable links.
- **Safety-number verification** — open. The server hands out public keys, so a compromised server
  could substitute one (docs/CHAT.md, "Known limit"); two members comparing a safety number
  outside the site would detect it.
- **Telegram-login recovery code handling** — open (decided direction 2026-10-17). Recovery codes
  are to apply to future Telegram logins too: such an account has no password to derive a
  wrapping key from (docs/AUTH.md).
- **Unlock a new device by confirming it on an already logged-in device** — unconfirmed proposal,
  not decided: instead of the password or the recovery code, a device that is already unlocked
  hands the private key over to the new one.
- **Operating-system notifications for mentions and direct messages** — unconfirmed proposal,
  not decided.
- **Chat embedding on other sites** — open. The embed route exists for this site's own pages
  (SE-NIGHT-2 part 6, docs/EMBED.md); other origins still need a configured list of allowed
  embedding origins (`frame-ancestors`) and a login inside a third-party frame; see
  docs/CHAT.md, "Embedding".
- **Call recording** — unconfirmed proposal, not decided. Calls are not recorded (privacy draft).
- **Linking calls to the events calendar** — unconfirmed proposal, not decided: an event could
  carry its call, and a call its event.

- Info pages with admin editor
- Accounts with Discord/Telegram login and 2FA for organisers/admins
- Bots and group roles
- Games hub and race-game connection
- Chat
- Notifications
- Admin pages (events calendar editable without code changes)
- VPS deployment — prepared (SE-NIGHT-2 part 7: image, compose with Caddy, backups, runbook in
  docs/DEPLOYMENT.md); the deployment itself waits for the owner's domains, VPS access and the
  off-site backup target.

## PART TWO — closed

- **Check a live room message right after login** — closed by SE-NIGHT-2 part 1
  (`feat/se-night-2`, PR #7, not merged yet). Answer: yes, it could miss its live update until
  reload, in two ways, both shown red by client/src/chat/chatCatchUp.test.jsx against the old
  code: a message stored between the panel's load and the new socket's subscription was never
  pushed, and a message pushed while the load was on its way was wiped by the load. Fixed by a
  catch-up fetch (`?after=<id>`) on every `subscribed` and a merge by id; no timeout changed.
- **Stale live calls** — closed by SE-NIGHT-2 part 2 (PR #7, not merged yet): a live call whose
  LiveKit room is gone is ended after 10 minutes like "End call", audited as "system"
  (docs/CALLS.md, "Stale live calls").
- **Password key derivation freezes the page** — closed by SE-NIGHT-2 part 3 (PR #7, not merged
  yet): Argon2id runs in a same-origin Web Worker; password buttons read "Checking…"; no CSP
  change (docs/AUTH.md, "Off the main thread").
- **2FA secrets encrypted at rest** — closed by SE-NIGHT-2 part 8 (PR #7, not merged yet): TOTP
  secrets sealed with libsodium under `SECRET_ENCRYPTION_KEY` (required in production), plain
  rows encrypted on start, a wrong key refuses with a clear log line (docs/AUTH.md).
- **Deployment preparation for the Contabo VPS** — closed by SE-NIGHT-2 part 7 (PR #7, not
  merged yet): deploy/site/ (Dockerfile, compose with Caddy, Caddyfiles, systemd timers),
  nightly SQLite online backups with restore, production refuses development defaults, the
  first-admin script, CI builds the image; runbook docs/DEPLOYMENT.md.
- **Remove the legacy-login route and the legacy flag in pre-login before go-live** — closed by
  SE-NIGHT-2 part 7 (PR #7, not merged yet): no account in the development database was flagged
  legacy and nothing outside the legacy flow depended on it; route, flag, browser branch, dev
  admin script branch and migration step removed (docs/AUTH.md, "Login key split").
- **Chat embedding on this site's own pages** — closed by SE-NIGHT-2 part 6 (PR #7, not merged
  yet): `/embed/chat` with the site's login state, a postMessage API with origin checks,
  `frame-ancestors 'self'` for `/embed/*` only, a demo page and docs/EMBED.md with the race
  game's snippet.
- **Cleanup: one fake WebSocket, one media library load** — closed by SE-NIGHT-2 part 5 (PR #7,
  not merged yet): the six per-test fake sockets replaced by client/src/test/fakeSocket.js; the
  sticker/GIF library loaded once per page and shared (client/src/chat/mediaLibrary.js).
- **Older direct messages** — closed by SE-NIGHT-2 part 4 (PR #7, not merged yet): a
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
