# Backlog

An entry moves from part one to part two only when its branch is merged into `master`.

## PART ONE — open

- **SE-NIGHT-1 piece 1 — App shell** — in review (PR #3). Client routing, layout with header
  and footer, 404 page, security headers.
- **SE-NIGHT-1 piece 2 — Database and accounts** — in review (PR #3). SQLite, registration,
  login, logout, password change, roles, bootstrap of the first admin, CSRF, rate limits.
- **SE-NIGHT-1 piece 3 — Two-factor authentication** — in review (PR #3). TOTP with QR code,
  recovery codes, required for organisers and admins.
- **SE-NIGHT-1 piece 4 — Admin: users, roles and audit log** — in review (PR #3). /admin with
  user search, role, can-start-games, lock, password reset; audit log for every admin action.
- **SE-NIGHT-1 piece 5 — Info pages with editor** — in review (PR #3). Public /info, admin
  editor with preview, draft pages from the official sources, Imprint and Privacy drafts.
- **SE-NIGHT-1 piece 6 — Events calendar** — in review (PR #3). /events week in local time,
  admin editor, the weekly schedule seeded.
- **SE-NIGHT-1 piece 7 — Games hub** — in review (PR #3). /games cards by status and
  visibility, admin editor, "Seasonal Race" (coming soon). The race-game connection stays open.
- **SE-NIGHT-1 piece 8 — Chat** — in review (PR #3). Live chat over WebSocket, rooms, guests
  with guest names, moderation (hide, mute, ban), reports, retention.
- **SE-CHAT-COMPOSER-1 — Chat as a reusable module; attachments, file uploads, scrolling** — in
  review (PR #3). Part A: the chat is one client module (`<ChatPanel>`, one connection per page)
  and one server area (`mountChat`), docs/CHAT.md. Part B: a message is optional text plus one
  attachment; stickers and GIFs are attached, not sent on click. Part C: members upload images
  and PDFs (metadata removed, access-checked, deleted with their message). Part D: the message
  list follows new messages, or offers "New messages" when scrolled up. Part E: `.env.example`
  complete and in the repository, `npm run dev:admin` exits on its own, check data removed.
- **SE-DESIGN-1 — Arena app shell, fixed viewport, dark mode, chat drawer** — in review (PR #4,
  which also carries PR #3's commits until #3 is merged). Part A: light/dark tokens, theme rule,
  no flash of the wrong theme. Part B: sidebar shell, no page scroll, home bento, full-height
  chat page. Part C: chat button and drawer with a room picker on every page except /chat and
  /admin. docs/DESIGN.md. Part D closes "ChatPanel keeps guest level after login": on login,
  logout or an account switch the chat module's shared connection reconnects as the new reader
  and the rooms and messages reload (docs/CHAT.md). Part E: the leftover check message removed
  from the development database and a stale `npm run dev:admin` process ended (2026-10-17).
- **SE-DM-1 — favourites, end-to-end encrypted direct messages, report with consent** — in
  progress (PR to come; built on PR #4, which carries PR #3). Piece 1: favourite rooms (star in
  the drawer's picker and the full chat's room list, favourites first) and favourite members
  (name menu in every message), members only. Piece 2: the password never leaves the browser
  (Argon2id in the browser, only a derived auth key is sent; pre-login salt; one-time legacy
  upgrade; docs/AUTH.md). Piece 3: every member's key pair, made in the browser, the private key
  only sealed on the server; optional recovery code; unlock, recovery and start over (docs/CHAT.md,
  "Keys and the recovery code"). Piece 4: end-to-end encrypted direct messages between members
  (drawer and /chat Direct tab, name menu, unread dot, key-change notice; docs/CHAT.md, "Direct
  messages"). Piece 5: reporting a direct message with consent (copies only when the reporter
  ticks to share them; moderators' views audited; copies deleted 90 days after review).
- **SE-DM-2 — unread counters, room mute, @mentions, member search, favourites star, presence
  setting, security fix** — in progress (on PR #5). Part 1: unread counters for rooms (blue) and
  private messages (orange), live in every tab (docs/CHAT.md, "Unread counters"). Part 2: muting
  a room (bell; left out of the room total, its count dimmed). Part 4: "Find a member" in the
  Direct tab.
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
- **Unread count for the chat button** — open. The drawer's chat button shows no badge: the chat
  module cannot tell how many messages are new for this reader yet.
- **Chat embedding in other applications** — open. An embed route, allowed embedding origins
  (`frame-ancestors`), login inside an embedded frame; see docs/CHAT.md, last section.
- **SE-CHAT-MEDIA-1 — Chat emojis, stickers, GIFs and link previews** — in review (PR #3).
  Part A: emoji picker for everyone. Part B: own sticker and GIF library (admin page, starter
  pack), members send stickers and GIFs. Part C: server-side link previews with SSRF
  protection, moderation of previews.
- **SE-SECURITY-FIX-1 — Security review fixes** — in review (PR #3). Dev-proxy "wrong origin",
  staff 2FA in the chat, sockets following account changes, per-IP guest limits, 2FA password and
  session hygiene, production proxy settings and per-username login limit, access before id
  lookups, pending 2FA login epoch, WebSocket scheme check, guest-writable rooms.

- Info pages with admin editor
- Accounts with Discord/Telegram login and 2FA for organisers/admins
- Bots and group roles
- Games hub and race-game connection
- Chat
- Notifications
- Admin pages (events calendar editable without code changes)
- VPS deployment

## PART TWO — closed

- **SE-FOUNDATION-1** — closed by PR #1 (`feat/se-foundation-1`), merged 2026-10-17.
  Repository, license, server with `/api/health`, landing page, design tokens, fonts,
  web-ready season marks with build script, tests, `npm run verify`, CI.
