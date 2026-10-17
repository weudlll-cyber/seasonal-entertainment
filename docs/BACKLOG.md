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
