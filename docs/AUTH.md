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
  at most 72 bytes (from when bcrypt read the password itself; kept unchanged). Email: a plain
  shape check; no confirmation mail is sent. The password rules are checked **in the browser only** (next
  section).
- **The password never reaches the server** (next section). The server stores bcrypt of the auth
  key the browser derives from it, cost 12 by default (`BCRYPT_COST`) _(race game)_.

## Login key split (decided 2026-10-17)

The password never leaves the browser. Each account has a random 16-byte **salt**
(`users.kdf_salt`). In the browser (`client/src/session/credentials.js`, on the project's one
crypto helper `shared/crypto.js`, libsodium):

1. `master = crypto_pwhash(password, salt)` — Argon2id, `OPSLIMIT_INTERACTIVE` /
   `MEMLIMIT_INTERACTIVE` (about 64 MiB);
2. `authKey = crypto_kdf_derive_from_key(master, id 1, context "se-auth")` — the only thing sent;
3. `wrapKey = crypto_kdf_derive_from_key(master, id 2, context "se-wrap")` — stays in the browser
   and seals the account's private key (docs/CHAT.md, direct messages).

libsodium's KDF context is exactly 8 bytes: the contexts are "se-auth" and "se-wrap" as C strings,
i.e. with their terminating NUL byte (`'se-auth\0'` in JavaScript).

**Off the main thread** (SE-NIGHT-2 part 3): step 1 takes most of a second and would freeze the
page, so `deriveAccountKeys` and `deriveRecoveryKey` run in a Web Worker
(`client/src/session/passwordHashing.worker.js`, which runs the very functions of
`shared/crypto.js`; `passwordHashing.js` is the page's side, with the same arguments and
results). One worker per page, started at the first password. Where there is no `Worker` (the
unit tests) or it fails to load, the same functions run on the main thread; the browser test
`client/e2e/passwordWorker.spec.js` makes sure a real login does use the worker. While a login,
registration, password change, unlock or recovery runs, its button reads **Checking…**
(`client/src/components/BusyButton.jsx`).

- **Pre-login**: `POST /api/auth/prelogin { username }` → `{ salt }`. An unknown username
  gets a deterministic fake salt — HMAC-SHA-256 of the lower-cased username, keyed with a key
  derived from `SESSION_SECRET` (no new setting) — so the answer has the same shape for every name
  and does not change between requests. (In development without a `SESSION_SECRET` the secret is
  random per start, so fake salts change on restart; production requires the setting.) The route
  shares the login's rate limiters: while a name or address is blocked from logging in, it gets no
  salts either; its own answers never fail and so never count.
- **Login**: `POST /api/auth/login { username, authKey }`. Every other place a password is entered
  sends the same way: registration (`salt`, `authKey`), own password change (`currentAuthKey`,
  `newSalt`, `newAuthKey`), 2FA setup and disable (`authKey` for "current password"), the admin's
  password reset (the admin's browser derives a fresh `salt` and `authKey` for the chosen
  password), the first-run bootstrap and `npm run dev:admin` (both through `shared/crypto.js`).
  The server checks only the shapes (`shared/cryptoFormat.js`: salt 16 bytes, keys 32 bytes) and
  answers `400` to a body carrying a password instead.
- **No legacy login any more** (removed in SE-NIGHT-2 part 7): accounts from before the key
  split had a one-time `POST /api/auth/legacy-login` that checked the password against the old
  hash and replaced it. No such account existed any more (the development database had none, and
  the site was never live), so the route, the `legacy` flag in the pre-login answer and the
  browser's branch for it are gone. An account in a database from before the split (no salt)
  cannot log in; an admin's password reset gives it a salt. Older databases keep an unused
  `legacy` column.
- **Unchanged**: lockout and rate limits, the session epoch, 2FA, the audit log, the same
  `401 invalid_credentials` for a wrong name or secret.
- **Wrapping key and recovery code**: the wrapping key seals the member's private key for direct
  messages; an **optional** recovery code (decided 2026-10-17: offered, can be skipped, can be
  made later) seals it a second time, for when the password is forgotten or reset — details in
  docs/CHAT.md, "Keys and the recovery code". A password change carries the re-sealed key; an
  admin's password reset cannot (the admin has no access to it): afterwards the member uses the
  recovery code or starts over with a new key pair. Setting, replacing or removing the recovery
  code needs the current password (its auth key), like every other change to the keys
  (2026-10-18).
- **Telegram logins (decided direction, 2026-10-17; not built)**: recovery codes are to apply to
  future Telegram logins too — an account that logs in through Telegram has no password to derive
  a wrapping key from, so its private key needs the recovery code (or a start-over) to open on a
  device. Open in docs/BACKLOG.md.

**Server-side checks lost** (they need the password): minimum length (10 characters) and maximum
length (72 bytes) of a new password — on registration, own password change, admin reset and
bootstrap. They are applied in the browser from the same `shared/accountRules.js` (registration,
password change, admin reset). There was no "password differs from the username" rule before, so
none was lost. **Kept on the server**: username rules, email shape, the age confirmation, the
shapes of salt and auth keys, the proof of the current password (password change, 2FA), every
rate limit, the lockout, locked accounts, the session epoch.

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
- **Setup** (`/account`): `POST /api/2fa/setup` needs the **current password** again (so a
  taken-over session cannot enrol its own authenticator; failed attempts count towards the
  per-account 2FA limit) and returns a new secret, its `otpauth://` link and a QR code (PNG
  data URL); calling it again replaces a pending secret, with the password again.
  `POST /api/2fa/enable` with a first valid code turns 2FA on and returns **ten recovery codes,
  shown once**; only their SHA-256 hashes are stored.
- **Login** for an account with 2FA has two steps: the password answers
  `{ twoFactorRequired: true }` and marks the session as half-way (not logged in; valid
  5 minutes, and only while the account's session epoch is unchanged, so a password reset in
  between voids it); `POST /api/2fa/login` with `code` or `recoveryCode` finishes it with a
  fresh session id.
- **No reuse:** each accepted 30-second step is remembered, and that code or an earlier one is
  refused afterwards. A recovery code is marked used in the same statement that accepts it.
- **Off:** `POST /api/2fa/disable` needs the password and a valid code or recovery code.
- **Turning 2FA on or off ends every other session** of the account (the same session-epoch
  bump as a password change, `bumpSessionEpoch` in `server/src/accounts/userStore.js`) and
  closes its other chat sockets; the session making the change is re-stamped and stays.
- **Staff must use it:** an organiser or admin without 2FA can log in, but every organiser/admin
  route answers `403 two_factor_required` until 2FA is on (`server/src/twofa/gate.js`, checked
  in `allow()`). In the chat, over HTTP and WebSocket alike, such an account counts as a member
  (`server/src/chat/viewer.js`). The session answer carries `twoFactorRequired`, and the site shows a banner
  leading to the setup. Members may turn it on voluntarily.
- **`REQUIRE_STAFF_2FA`** (default `true`) may be set to `false` for local development only;
  the server refuses to start with `false` in production.
- Failed codes are rate-limited (`rateLimits.twoFactor`: 5 per 15 minutes, per account for
  enable/disable, per IP for the login step).
- **TOTP secrets are encrypted at rest** (SE-NIGHT-2 part 8, `server/src/twofa/secretBox.js`):
  - Authenticated encryption with the project's libsodium helper (`shared/crypto.js`
    `sealBytes`/`openSealed`: secretbox, a fresh nonce each time).
  - The key is `SECRET_ENCRYPTION_KEY`, 32 random bytes as base64 (`server/src/secretKey.js`).
    Production refuses to start without it or with the development key. Development without
    it uses a fixed, public development key and says so at start, so development data
    survives restarts.
  - Stored as `enc1:` + base64; the secret shown at setup is nowhere in the database.
  - On every start, rows still in plain text are encrypted (`sealStoredSecrets`, idempotent:
    sealed rows are skipped).
  - A secret that does not open with the key (another key, a changed row) **never passes**.
    The code is refused, and the server log says "the 2FA secret of user <id> cannot be
    decrypted: SECRET_ENCRYPTION_KEY is not the key it was stored with", with no part of the
    secret. At start it also counts such rows.
  - Recovery codes stay SHA-256 hashes and work whatever the key, so they remain the way back
    in.
  - **Losing the key** makes every stored 2FA secret unreadable: those accounts sign in with a
    recovery code or need 2FA reset by an admin. Keep the key with the other secrets, not with
    the database backups.

## Authorisation: deny by default

Every route's first handler is `allow(level)` with level `public`, `member`, `organiser` or
`admin` (`server/src/http/access.js`). A guest on a non-public route gets `401`, a too-low role
`403`. `server/test/access.test.js` walks the real router and **fails if any route lacks the
declaration** _(race game: route-policy drift test)_. **Authorisation runs before any lookup:**
a route's record (`:id`) is loaded by `loadById` (`server/src/http/loadById.js`) as a handler
after `allow()`, never with `router.param`, so a caller without access gets the same answer for
an existing and a missing id; `server/test/accessBeforeLookup.test.js` fails on any
`router.param`. The client hides pages a user cannot use,
but every decision is made again on the server.

## Content-Security-Policy and WebAssembly

`script-src` allows `'wasm-unsafe-eval'` besides `'self'` (confirmed by the owner 2026-10-18):
it permits compiling WebAssembly only, which the browser's cryptography (libsodium,
`shared/crypto.js`) needs; JavaScript `eval` and inline scripts stay forbidden
(`server/src/http/securityHeaders.js`).

The password-hashing worker needs **no CSP change**: it is a same-origin module file from
`/assets` (no inline or `blob:` worker), so the absent `worker-src` falls back to
`script-src 'self'`, and the worker's own response carries the same policy, whose
`'wasm-unsafe-eval'` lets it compile libsodium. Checked in a real browser by
`client/e2e/passwordWorker.spec.js`, which fails on any CSP violation.

## CSRF

Every state-changing API request (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` (or
`Referer`) equal to the site's own origin (`PUBLIC_ORIGIN`, or derived from the `Host` header)
_(race game)_. Strict by default (`CSRF_STRICT=true`): a request with neither header is refused —
stricter than the race game, which is strict only in production. Together with `SameSite=Lax`
cookies this blocks cross-site form posts and fetches. The chat WebSocket upgrade uses the same
rule (`selfOrigin()` in `server/src/http/csrf.js`): the full origin, scheme included, must match.

## Rate limits

All answer `429 too_many_attempts`. Numbers are in `server/src/config.js` (`rateLimits`).

| Route                  | Window | Limit | Keyed on | Counts          |
| ---------------------- | ------ | ----- | -------- | --------------- |
| `POST /api/auth/login` | 15 min | 10    | IP       | failed attempts |
| `POST /api/auth/login` | 15 min | 10    | username | failed attempts |

`POST /api/auth/prelogin` shares the two login limiters above
(the same counters): a blocked name or address gets neither salts nor logins.
| `POST /api/auth/register` | 1 h | 5 | IP | every attempt |
| `POST /api/auth/password` | 15 min | 5 | account | failed attempts |
| `POST /api/auth/bootstrap` | 1 h | 10 | IP | every attempt |

The password-change limit keys on the account, not the IP _(race game)_: people behind one
address must not lock each other out. Login is limited twice: per IP, and per username as typed
(case-insensitive), whether that account exists or not, so the 429 reveals nothing. The
per-username limit means someone failing ten times can block that name's logins for up to 15
minutes; that is the accepted price of stopping guessing from many addresses. Behind a reverse
proxy `TRUST_PROXY` makes the client IP the real one; in production the server refuses to start
unless `TRUST_PROXY` and `PUBLIC_ORIGIN` are both set (`TRUST_PROXY=0` when nothing is in
front).

## The first admin: bootstrap

`POST /api/auth/bootstrap` with `{ username, email, salt, authKey }` (derived from the password as
above) creates the first admin, once:

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
in memory, calls the bootstrap route with it (salt and auth key derived from the password with
`shared/crypto.js`), and writes the username and a random password to
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

Chat guests are not accounts: a guest gets a random name (`Guest-` and six characters a–z, 2–7) held in the session
once they write or report. Registered usernames may not start with "Guest-", so an account can
never look like a guest. Chat moderation (hide, mute, ban) is an organiser/admin action and
therefore needs 2FA like every staff route. Stickers and GIFs are for members only (guests
write text and emojis); `GET /api/chat/media` (the picker's library) is a member route, and the
library itself is managed by admins (with 2FA) at `/api/admin/chat/media`. Removing a link
preview and marking a message's reports reviewed are organiser/admin routes (with 2FA), like
the rest of chat moderation.

**Chat file uploads** are a member route (`POST /api/chat/uploads`); guests cannot upload or
attach. **Every request for an uploaded file applies the chat's read rule** (`GET
/api/chat/files/...`, `server/src/uploads/routes.js`): the viewer must be able to read the room
of the file's message; a hidden message's file goes to moderators only; a file not yet sent goes
to its uploader only; otherwise the answer is the same 404 as for an unknown file. "Remove file"
is an organiser/admin route (with 2FA). Details: ARCHITECTURE.md, "Chat".

## Tests

Server tests use a temporary database per test file and delete it (`server/test/helpers/testApp.js`).
Browser tests start the server on their own temporary database (`scripts/e2e.mjs`), never the dev
one, and delete it after the run.
