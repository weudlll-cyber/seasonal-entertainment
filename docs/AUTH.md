# AUTH.md — accounts, sessions, roles and bootstrap

What the code does today (`server/src/accounts/`, `server/src/http/`, `shared/accountRules.js`).
Where this file and the code disagree, the code is right and this file is a bug. Patterns reused
from the race game's `docs/AUTH.md` are marked _(race game)_.

## Accounts and roles

- **Roles:** `member`, `organiser`, `admin`, in that order. A guest is anyone not signed in;
  guests have no account and no stored role.
- **"Can start games"** is a separate flag on the account, granted by admins; admins have it
  implicitly (`canStartGames` in the session answer is true for every admin).
- **Registration is open to everyone** (decided 2026-10-16): username, email, password and the
  required checkbox "I am at least 14 years old" (minimum age 14, decided 2026-10-17). No date of
  birth is stored, and the checkbox itself is not stored either. New accounts are `member`.
- **Rules shared by server and client** (`shared/accountRules.js`): username 3–24 characters,
  letters, digits, `_`, `-`, `.`, starting with a letter or digit; unique **case-insensitively**
  (enforced by the database, `COLLATE NOCASE`). Password at least 10 characters _(race game)_ and
  at most 72 bytes (bcrypt's limit). Email: a plain shape check; no confirmation mail is sent.
- **Passwords** are hashed with bcrypt, cost 12 by default (`BCRYPT_COST`) _(race game)_.

## Sessions

- Server-side, in the SQLite database (table `sessions`, created by the session store). The
  browser holds only the cookie: `HttpOnly`, `SameSite=Lax`, path `/`, 30 days, `Secure` when
  `COOKIE_SECURE` (default: on in production). Name `__Host-se.sid` when Secure, else `se.sid`.
- **Login** regenerates the session id (no fixation) and stamps it with the account's
  **session epoch** _(race game)_. Wrong username and wrong password give the same
  `401 invalid_credentials`. A locked account answers `403 account_locked`, but only to someone
  who gave the right password.
- **Every request** reloads the account: a session whose account is gone, locked, or has a
  different epoch is logged out right there (`currentUser` in `server/src/http/session.js`).
- **Own password change** (`POST /api/auth/password`, current + new password; the account comes
  from the session, never the body) bumps the epoch in the same statement that stores the new
  hash: every **other** session of that account ends; the session making the change is
  re-stamped and stays signed in _(race game)_. An admin password reset bumps the epoch too and ends all of that user's sessions.
- **Logout** destroys the server-side session and clears the cookie.
- **Open chat sockets follow the account:** logout closes that session's chat WebSocket; a role,
  lock or password change closes the account's sockets (except the session making its own
  change); and every push re-checks the account (`server/src/chat/hub.js`).

## Two-factor authentication (2FA)

- **TOTP** (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), readable by every authenticator
  app; implemented in `server/src/twofa/totp.js` and tested against the RFC's own vectors.
- **Setup** (`/account`): `POST /api/2fa/setup` returns a new secret, its `otpauth://` link
  and a QR code (PNG data URL). `POST /api/2fa/enable` with a first valid code turns 2FA on and
  returns **ten recovery codes, shown once**; only their SHA-256 hashes are stored.
- **Login** for an account with 2FA has two steps: the password answers
  `{ twoFactorRequired: true }` and marks the session as half-way (not logged in; valid
  5 minutes); `POST /api/2fa/login` with `code` or `recoveryCode` finishes it with a fresh
  session id.
- **No reuse:** each accepted 30-second step is remembered, and that code or an earlier one is
  refused afterwards. A recovery code is marked used in the same statement that accepts it.
- **Off:** `POST /api/2fa/disable` needs the password and a valid code or recovery code.
- **Staff must use it:** an organiser or admin without 2FA can log in, but every organiser/admin
  route answers `403 two_factor_required` until 2FA is on (`server/src/twofa/gate.js`, checked
  in `allow()`). In the chat, over HTTP and WebSocket alike, such an account counts as a member
  (`server/src/chat/viewer.js`). The session answer carries `twoFactorRequired`, and the site shows a banner
  leading to the setup. Members may turn it on voluntarily.
- **`REQUIRE_STAFF_2FA`** (default `true`) may be set to `false` for local development only;
  the server refuses to start with `false` in production.
- Failed codes are rate-limited (`rateLimits.twoFactor`: 5 per 15 minutes, per account for
  enable/disable, per IP for the login step).
- TOTP secrets are stored unencrypted in the database; encrypting them needs a key-management
  decision (night report).

## Authorisation: deny by default

Every route's first handler is `allow(level)` with level `public`, `member`, `organiser` or
`admin` (`server/src/http/access.js`). A guest on a non-public route gets `401`, a too-low role
`403`. `server/test/access.test.js` walks the real router and **fails if any route lacks the
declaration** _(race game: route-policy drift test)_. The client hides pages a user cannot use,
but every decision is made again on the server.

## CSRF

Every state-changing API request (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` (or
`Referer`) equal to the site's own origin (`PUBLIC_ORIGIN`, or derived from the `Host` header)
_(race game)_. Strict by default (`CSRF_STRICT=true`): a request with neither header is refused —
stricter than the race game, which is strict only in production. Together with `SameSite=Lax`
cookies this blocks cross-site form posts and fetches. The chat WebSocket upgrade uses the same
rule (`selfOrigin()` in `server/src/http/csrf.js`): the full origin, scheme included, must match.

## Rate limits

All answer `429 too_many_attempts`. Numbers are in `server/src/config.js` (`rateLimits`).

| Route                      | Window | Limit | Keyed on | Counts          |
| -------------------------- | ------ | ----- | -------- | --------------- |
| `POST /api/auth/login`     | 15 min | 10    | IP       | failed attempts |
| `POST /api/auth/register`  | 1 h    | 5     | IP       | every attempt   |
| `POST /api/auth/password`  | 15 min | 5     | account  | failed attempts |
| `POST /api/auth/bootstrap` | 1 h    | 10    | IP       | every attempt   |

The password-change limit keys on the account, not the IP _(race game)_: people behind one
address must not lock each other out. Behind a reverse proxy set `TRUST_PROXY` so the client IP
is the real one.

## The first admin: bootstrap

`POST /api/auth/bootstrap` with `{ username, email, password }` creates the first admin, once:

1. **The token travels in the `x-bootstrap-token` header, never in the body** _(race game: its
   client once sent it in the body and first setup could not succeed anywhere)_. It is compared
   in constant time with `BOOTSTRAP_TOKEN` from the environment.
2. No token configured **and** wrong token both answer `403 bootstrap_unavailable`. Only the
   server log tells them apart (`BOOTSTRAP_TOKEN not set; bootstrap disabled` vs
   `bootstrap token mismatch; refused`); the log never contains the token or any part of it.
3. The admin check and the insert run in one transaction: if an admin exists, `409`.
4. The new admin is logged in (`201`).

After the first admin exists, unset `BOOTSTRAP_TOKEN`; the route stays closed anyway.

### Local development admin

`npm run dev:admin` runs the real app in-process on a random port with a one-time token held only
in memory, calls the bootstrap route with it, and writes the username and a random password to
`data/DEV-ADMIN.txt` (gitignored). Admins need 2FA, so it then turns 2FA on for that account
through the real API and adds the TOTP secret, its `otpauth://` link and the recovery codes to
the same file. It also adds a `SESSION_SECRET` to `.env` if missing, so dev logins survive
restarts. Running it again changes nothing.

## Admin: users and the audit log

`/admin` (admins only, with 2FA) manages accounts through `/api/admin/users`: list and search,
change role, grant or revoke "can start games", lock or unlock, and reset a password (the admin
sets the new one; all of that user's sessions end). **The last active admin can be neither
demoted nor locked** — refused in the data layer itself (`server/src/accounts/userAdmin.js`), so
no route can bypass it _(race game)_; an admin cannot lock their own account either.

Every admin action writes **exactly one** entry to the audit log (who, when, what, target, before
and after, never a password) through the one helper `recordAudit`
(`server/src/audit/auditLog.js`); the Audit page lists it newest first. Every later admin or
moderation action uses the same helper.

## Chat identities

Chat guests are not accounts: a guest gets a random name (`Guest-xxxx`) held in the session
once they write or report. Registered usernames may not start with "Guest-", so an account can
never look like a guest. Chat moderation (hide, mute, ban) is an organiser/admin action and
therefore needs 2FA like every staff route. Details: ARCHITECTURE.md, "Chat".

## Tests

Server tests use a temporary database per test file and delete it (`server/test/helpers/testApp.js`).
Browser tests start the server on their own temporary database (`scripts/e2e.mjs`), never the dev
one, and delete it after the run.
