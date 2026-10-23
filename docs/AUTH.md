# AUTH.md — accounts, sessions, roles and bootstrap

What the code does today (`server/src/accounts/`, `server/src/http/`, `shared/accountRules.js`).
Where this file and the code disagree, the code is right and this file is a bug. Patterns reused
from the race game's `docs/AUTH.md` are marked _(race game)_.

## Accounts and roles

- **Roles:** `member`, `organiser`, `admin`, in that order. A guest is anyone not signed in;
  guests have no account and no stored role.
- **"Can start games"** is a separate flag on the account, granted by admins; admins have it
  implicitly (`canStartGames` in the session answer is true for every admin).
- **Registration is open to everyone** (decided 2026-10-16; admins can close it with the
  "Registration open" setting, docs/SETTINGS.md: the page and the route then say "Registration is
  closed at the moment.", while the first admin's bootstrap still works): username, email, password
  and the required checkbox "I am at least 14 years old" (minimum age 14, decided 2026-10-17). No
  date of birth is stored, and the checkbox itself is not stored either. New accounts are `member`.
- **Rules shared by server and client** (`shared/accountRules.js`): username 3–24 characters,
  letters, digits, `_`, `-`, `.`, starting with a letter or digit; unique **case-insensitively**
  (enforced by the database, `COLLATE NOCASE`). Password at least 10 characters _(race game)_ and at
  most 72 bytes (from when bcrypt read the password itself; kept unchanged). Email: a plain shape
  check; no confirmation mail is sent. The password rules are checked **in the browser only** (next
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
  salts either; its own answers never fail and so never count there. Its own limit per IP counts
  every request (60 per 15 minutes; since 2026-10-21).
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
- **Unlock on another device** (decided 2026-10-22): after login on a device without the
  private key, besides the password and the recovery code, **Confirm on another device**.
  - **The new device** makes a one-time key pair and sends its public key
    (`POST /api/keys/handover`). It shows a 6-digit code computed from that public key
    (`handoverCode` in `shared/crypto.js`: BLAKE2b, so a key swapped on the way shows another
    code).
  - **The request** is valid 5 minutes, one at a time per account (`409 request_pending` for a
    second device; at most 10 an hour per account, `rateLimits.keyHandover`). It is kept in the
    server's memory only (`server/src/keys/handover.js`), not in the database. The server relays
    it as a personal event (`keyRequest`) over the live chat connection to the account's own
    open pages, never anyone else's.
  - **The unlocked device**: only a page where the key is unlocked asks
    (`client/src/keys/DeviceRequestPrompt.jsx`): "A new device wants access to your direct
    messages — code 123 456. Is this you?" with Confirm / Reject. The member compares the two
    codes. **Confirm** seals the private key to the one-time public key (`crypto_box_seal`,
    `sealForDevice`) and sends only that box (exactly 80 bytes; the server takes nothing else,
    so it never holds the key unsealed). **Reject** sends nothing of the key.
  - **Delivery**: the new device asks every 2 seconds (`GET /api/keys/handover/:id`, its own
    session only; `client/src/keys/DeviceUnlock.jsx`) and gets the box once; then it is deleted.
    It opens the box with its one-time private key, checks that the key belongs to the account's
    public key, and keeps it like a key the password opened (`fromOtherDevice` in
    `KeyContext.jsx`). The new device cannot answer its own request.
  - **Nothing happens** on a rejected, expired or unknown request.
  - **Audit**: `keys.handover_request`, `keys.handover_confirm`, `keys.handover_reject`, never
    with a key.
  - Tests: `server/test/keyHandover.test.js`, `client/src/keys/deviceHandover.test.jsx`,
    `shared/crypto.test.js`.
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
  browser holds only the cookie: `HttpOnly`, `SameSite=Lax`, path `/`, `Secure` when
  `COOKIE_SECURE` (default: on in production). Name `__Host-se.sid` when Secure, else `se.sid`.
- **7 days without use** (decided 2026-10-22; since 2026-10-23 the "Sign out after" setting, 1–90
  days, docs/SETTINGS.md; 7 below stands for its value): a signed-in session ends after 7 days in
  which it was not used. Every authenticated request renews it to 7 days from then: the session's
  `usedAt` stamp, the stored expiry and the cookie's. To spare a database write per request, it
  renews at most once a minute (`renewSession` in `server/src/http/session.js`; the store's own
  per-request "touch" is switched off). A session whose `usedAt` is more than 7 days old is refused
  even if its record still exists (`sessionUser`, also used by the chat WebSocket). Signed-in
  sessions from the earlier 30-day rule are capped at 7 days from the server's start. A guest's
  session, which only holds a guest name (docs/CHAT.md), keeps 30 days. Tests:
  `server/test/sessionIdle.test.js`.
- **Login** regenerates the session id (no fixation) and stamps it with the account's
  **session epoch** _(race game)_. Wrong username and wrong password give the same
  `401 invalid_credentials`. A locked account answers `403 account_locked`, but only to someone
  who gave the right password.
- **Every request** reloads the account: a session whose account is gone, locked, or has a
  different epoch is logged out right there (`currentUser` in `server/src/http/session.js`).
- **Own password change** (`POST /api/auth/password`, current + new password; the account comes from
  the session, never the body) bumps the epoch in the same statement that stores the new hash: every
  **other** session of that account ends; the session making the change is re-stamped and stays
  signed in _(race game)_. An admin password reset bumps the epoch too and ends all of that user's
  sessions.
- **Logout** destroys the server-side session and clears the cookie.
- **Open chat sockets follow the account:** logout closes that session's chat WebSocket; a role,
  lock or password change closes the account's sockets (except the session making its own
  change); and every push re-checks the account (`server/src/chat/hub.js`).

## Embed tokens (the chat on approved other sites)

The chat embedded on a site an admin approved (docs/EMBED.md) has no cookie there. It acts for a
member with an **embed token** instead (`server/src/embed/`; SE-NIGHT-2 follow-up, part A):

- **Issued** by `POST /api/embed/token { origin }` to a member's own **cookie** session (the
  login popup on this site), only for an approved site (`403 origin_not_allowed` otherwise), at
  most 30 per member and hour. A token cannot ask for another token. The answer is
  `{ token, expiresAt }`: 32 random bytes (base64url). Only its SHA-256 is stored
  (`embed_tokens`), with the account, the site, the account's **session epoch** at issue and the
  expiry.
- **Valid 12 hours** (decision rule of 2026-10-19), for that member and that site.
- **Sent** by the frame in the `X-Embed-Token` header, and on the chat WebSocket as the
  subprotocol `se-embed.<token>` (next to `se-chat`, which the server answers with). The token
  is not a cookie, so CSRF rules are unaffected: the requests come from the frame, on this
  site's origin, and pass the usual Origin check. Requests without the header keep cookie
  sessions exactly as before.
- **Scope** (`server/src/embed/auth.js`, an allow-list of exact paths): `GET /api/auth/session`,
  the chat's rooms (read, write, read markers, mutes, reports), direct messages (list, read,
  send, read marker, report), unread counts, favourites, the member search, the sticker/GIF
  library, and `/api/embed/me` and `/api/embed/logout`. Everything else answers
  `403 embed_not_allowed`: uploads, keys, account (password, logout, privacy), 2FA, moderation,
  admin, calls. Within the scope the usual rules apply to the token's member: room access,
  mute and ban, rate limits, the staff 2FA gate.
- **Ends at once** (`401 embed_token_invalid`, and its sockets close) when:
  - it expires;
  - the frame logs out (`POST /api/embed/logout`);
  - the member logs out on the site (all their embed tokens end);
  - the session epoch moves (own password change, admin reset, 2FA on or off);
  - the account is locked or deleted;
  - an admin removes the site from the list.
- **In the browser** the token and the private key live in the frame's memory only
  (`client/src/embed/embedAuth.js`, `keys/KeyContext.jsx`: no IndexedDB on other sites, where
  storage is partitioned). On `401 embed_token_invalid` the frame forgets both at once.
- **The popup** (`/embed-login`) is a top-level page on this site, with its address visible. It
  uses the normal login (2FA included) and then derives the keys from the password **in the
  popup** (the same derivation, `session/credentials.js`). It hands over only to its opener, and
  only when that opener is this site's own frame (same origin, `targetOrigin` this origin). It is
  the one page sent without `Cross-Origin-Opener-Policy`, which would cut it off from that
  opener, and it cannot be framed.

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
  route answers `403 two_factor_required` until 2FA is on (`server/src/twofa/gate.js`, checked in
  `allow()`). In the chat, over HTTP and WebSocket alike, such an account counts as a member
  (`server/src/chat/viewer.js`). The session answer carries `twoFactorRequired`, and the site shows
  a banner leading to the setup. Members may turn it on voluntarily.
- **2FA for every member** (the "Require 2FA for every member" setting, off by default,
  2026-10-23): while it is on, a member without 2FA counts as a guest everywhere but `/api/auth`
  and `/api/2fa`; member routes answer `403 two_factor_required`; the session answer carries
  `twoFactorRequired`, the banner shows, and the login leads to the setup instead of `?next=`.
  Organisers and admins keep their own rule above.
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
  - A secret that opens but is no TOTP secret (not base32, e.g. encrypted twice) is refused the
    same way, with the same answer (401 "That code is not valid.", never a 500) and the log line
    "the 2FA secret of user <id> cannot be used: it decrypts, but not to a TOTP secret"
    (`openSecret`, `server/src/twofa/secretBox.js`).
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
stricter than the race game, which is strict only in production. Production refuses to start with
`CSRF_STRICT=false` (decided 2026-10-23). Together with `SameSite=Lax` cookies this blocks
cross-site form posts and fetches. The chat WebSocket upgrade uses the same rule (`selfOrigin()` in
`server/src/http/csrf.js`): the full origin, scheme included, must match.

## Rate limits

All answer `429 too_many_attempts`. Numbers are in `server/src/config.js` (`rateLimits`).

| Route                      | Window | Limit | Keyed on | Counts          |
| -------------------------- | ------ | ----- | -------- | --------------- |
| `POST /api/auth/login`     | 15 min | 10    | IP       | failed attempts |
| `POST /api/auth/login`     | 15 min | 10    | username | failed attempts |
| `POST /api/auth/prelogin`  | 15 min | 60    | IP       | every request   |
| `POST /api/auth/register`  | 1 h    | 5     | IP       | every attempt   |
| `POST /api/auth/password`  | 15 min | 5     | account  | failed attempts |
| `POST /api/auth/bootstrap` | 1 h    | 10    | IP       | every attempt   |
| every `GET` under `/api`   | 1 min  | 1200  | IP       | every request   |
| `POST /api/keys/handover`  | 1 h    | 10    | account  | every request   |

`POST /api/auth/prelogin` also shares the two login limiters above (the same counters): a blocked
name or address gets neither salts nor logins. The limit on every read (since 2026-10-21) covers
the public reads that have no limit of their own (session, info, games, calls, chat rooms and
messages, files, the embed check); a page load makes a handful, so only a flood meets it. Routes
with their own limits (bots' reads, member search) keep them as well.

The per-username login limit is kept as it is on purpose (decided 2026-10-23): anyone who knows a
name can block its logins for 15 minutes with wrong passwords, and a correct password does not
pass the block either. That is the price of stopping guesses spread over many addresses.

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
in memory and, when the database has no admin yet, calls the bootstrap route with it (salt and
auth key derived from the password with `shared/crypto.js`; asked first, so a run again spends
no key derivation and no bcrypt hash on a bootstrap that could only be refused), and writes
the username and a random password to `data/DEV-ADMIN.txt` (gitignored). Admins need 2FA, so it then turns 2FA on for that account
through the real API and adds the TOTP secret, its `otpauth://` link and the recovery codes to
the same file. It also adds a `SESSION_SECRET` to `.env` if missing, so dev logins survive
restarts. Run again when the account already has 2FA, it rewrites the file's 2FA part from the
secret stored now (it may have been set up again since), keeping the username and password; the
recovery codes are stored hashed and are not shown again. It only reads: the account's 2FA is
never reset or changed, since an authenticator app uses it.

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
