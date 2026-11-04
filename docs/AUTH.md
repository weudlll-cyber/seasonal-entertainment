# AUTH.md — accounts, sessions, roles and bootstrap

What the code does today (`server/src/accounts/`, `server/src/http/`, `shared/accountRules.js`).
Where this file and the code disagree, the code is right and this file is a bug. Patterns reused
from the race game's `docs/AUTH.md` are marked _(race game)_.

## Accounts and roles

- **Roles:** `member`, `organiser`, `admin`, in that order. A guest is anyone not signed in;
  guests have no account and no stored role.
- **"Can start games"** is a separate flag on the account, granted by admins; admins have it
  implicitly (`canStartGames` in the session answer is true for every admin).
- **Two ways in** (decided 2026-11-02): Discord, the primary one (an account made with it has no
  email and no password until it sets one; "Discord" below), and username and password.
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
- **A new password is typed twice** (decided 2026-11-03): registration, the first password of an
  account made with Discord (account page and the Private messages panel), the password change and
  the admin's reset have a "Repeat password" field (`client/src/components/RepeatPasswordField.jsx`).
  A mismatch sends nothing and says "The passwords do not match." at that field; the repeat never
  goes to the server. Fields that only confirm the current password stay single.
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
- **Logins without a password** (direction decided 2026-10-17 for Telegram, built 2026-11-02 for
  Discord; Telegram login is not planned any more): an account made with Discord has no password
  to derive a wrapping key from. Before its first private message it chooses a recovery code or a
  password to protect the key (docs/CHAT.md, "Accounts without a password").

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
- **Deleting the account** deletes every session of it, also one half-way through the 2FA login
  ("Deleting an account" below).
- **Open chat sockets follow the account:** logout closes that session's chat WebSocket; a role,
  lock or password change closes the account's sockets (except the session making its own
  change); and every push re-checks the account (`server/src/chat/hub.js`).

## Discord (SE-DISCORD-1, decided 2026-11-02)

Discord is the primary login. Username and password registration stays for people without
Discord; they have no steps. While Discord is set up, the password sign-up page opens with a hint
to sign up with Discord instead, since only then do the roles show
(`client/src/discord/DiscordSignupHint.jsx`), then the line "or with email and a password (no
Discord steps)" between divider lines that stay at every width (at phone width the text wraps
between them; `client/src/discord/Discord.css`). Telegram login is not planned any more. Code: `server/src/discord/`,
`client/src/discord/`. The probe of 2026-11-02 found how Discord behaves; what follows relies on
it.

**Set up** with `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (the Seasonal Tokens server, 902220302199689266) and the client secret, given as `DISCORD_CLIENT_SECRET` or in the file named
by `DISCORD_CLIENT_SECRET_FILE` (`server/src/discord/config.js`; the installer asks for them,
docs/DEPLOYMENT.md, "Discord login"). All three or none. With none,
the feature is off: no Discord button, and every `/api/auth/discord` path answers 404. The
session answer says which (`features.discord`). The redirect is `DISCORD_REDIRECT_URI`, or
`PUBLIC_ORIGIN` + `/api/auth/discord/callback`. It must be registered at Discord character for
character: in the probe, invisible leading spaces in the portal broke it.

**The flow** (`server/src/discord/routes.js`):

- `GET /api/auth/discord/start?intent=login|link|confirm&next=/path` keeps a fresh `state` and
  PKCE verifier in the session and sends the browser to Discord's consent page (with
  `prompt=none`: someone who already agreed to these scopes goes straight back). It asks for the
  scopes `identify` and `guilds.members.read` only: no `guilds` (it would list all of a member's
  servers) and no `email`. There is no bot on the server.
- `GET /api/auth/discord/callback` checks the state in constant time, once (the flow is deleted
  from the session before anything else), within 10 minutes and for the same account that
  started it. It trades the code with the verifier and reads `/users/@me`, keeping the id and the
  name only. Then, by intent:
  - **login**: the linked account is logged in under the password login's rules: a locked
    account is refused, and an account with 2FA gets the second step (the page then shows
    the code form at once, `/login?discord=2fa`). Without a linked account, it starts a
    **sign-up**.
  - **link**: the signed-in account is linked. A Discord user linked to another account is
    refused (`?discord=taken`, and the database's UNIQUE on `discord_id` as well), and so is a
    second Discord user for an account that has one (`other_user`).
  - **confirm**: proves that it is the account's own Discord user (next section).
- Every login and link also reads the member's roles, with the tokens just given (next
  section, "Discord: steps").
- Failures go back to the page with `?discord=<reason>` (`expired`, `denied`, `failed`,
  `locked`, `closed`, `taken`, `other_user`, `not_linked`, `too_many`;
  `client/src/discord/discordLinks.js` says them in words). They count on the login's per-IP
  limit for failed attempts. A refused consent does not count.
- **Sign-up** (`/register/discord`, `client/src/pages/DiscordSignupPage.jsx`): the server holds
  the Discord user for 15 minutes, with the refresh token sealed. The page offers a username: the
  Discord name made to fit the site's rules, with a number when it is taken
  (`server/src/discord/username.js`). The member may change it, and must confirm their age as on
  every registration. `POST /api/auth/discord/register` creates the account (no email, no
  password: both columns are optional since 2026-11-02; older databases get the users table
  rebuilt once, `relaxEmailAndPassword` in `server/src/accounts/schema.js`, every account and
  reference kept; only references the rebuild itself broke stop it) and its link in one
  transaction, and logs it in. It shares the registration's rate limit, and is refused while
  registration is closed.
- **Unlink** (`DELETE /api/auth/discord`, the account page): only for an account with a
  password, proven with it. An account without one would have no way to log in, so it is told
  to set a password first. The refresh token is revoked at Discord. Revoking it ends the whole
  grant, which is why older refresh tokens are never revoked one by one.
- **Discord: grants not kept** (`server/src/discord/droppedGrants.js`, decided 2026-11-04): a
  fresh grant the site does not keep is revoked at Discord, best effort, so it does not stay
  listed under the member's authorised apps. That covers a login callback for someone already
  logged in, a sign-up while registration is closed, a link refused (`other_user`,
  `not_linked`), and a held sign-up that is replaced by another Discord user's or times out:
  revoked when the browser comes back, or by the daily job's minute tick (`sweepSignups`) when
  it never does. Because revoking ends the whole grant, nothing is revoked while an account here
  holds that Discord user: a locked account's login, a link refused as `taken`, and a login
  while someone else is signed in keep the linked account's grant working. A sign-up held again
  for the same Discord user is not revoked either. Tests: `server/test/discordGrants.test.js`.
- Only the Discord user id (unique), its name and the role ids are stored, never an email. The
  client secret and the tokens never reach a browser or a log. The secret goes only to Discord,
  in the token calls' `Authorization` header.
- Tests: `server/test/discordLogin.test.js`, against the pretend Discord
  (`server/test/helpers/fakeDiscord.js`, which behaves as the probe found: codes bound to their
  PKCE challenge, rotating refresh tokens, 10004); `server/test/accountsRebuild.test.js`;
  `client/src/discord/discordPages.test.jsx`. In the browser tests the same pretend Discord
  answers a second server (port 3811, `client/e2e/fakeDiscordPreload.mjs`): the round trip of
  "Confirm with Discord" in `client/e2e/discordConfirm.spec.js`.

### Discord: steps and the daily read

Members carry **steps** from the Seasonal Tokens Discord server (decided 2026-11-02). There are
three ladders, and each shows only the member's highest step:

- **Holder**: Holder < Bronze < Silver < Golden < Platinum < Diamond < Seasonal <
  Ultimate-Dragon Whale.
- **Farmer**: Farmer Holder < Farmer Bronze < … < Farmer Seasonal < Ultimate-Farmer Whale.
- **Investor**: Level 1 Investor < … < Level 4 Investor.

The shipped seed holds these 20 steps with their role ids and icons, exported from the PC test
site on 2026-11-03. The four Investor icons are Twemoji graphics (CC-BY 4.0); their credit is on
the live site's Imprint, written there by the owner, not in the code (decided 2026-11-04).

Admins give each step the Discord role id that grants it, set the order and upload an icon
(Admin → Discord steps). **Steps never grant rights on the site**; only the owner gives roles.

**Steps shipped with the project**: `server/src/discord/seed/steps.json` (ladder, name,
position, role id, icon file) with the icons in `seed/icons/`. A database that never had a step
gets them once at the server's start (`seedSteps` in `server/src/discord/steps.js`, called from
`server/src/index.js` after the app is built, the icons through the chat handle's
`images.storeIcon` like an upload); `sqlite_sequence` remembers it, so admins' edits are never
undone and an emptied list stays empty. `npm run steps:export` (`scripts/export-steps.mjs`)
writes the current database's steps and icons into that seed, reading the database read-only
(by default the one the server uses; `--db`, `--media`, `--out` choose others); commit the
result, and a new site starts with those steps. Steps only: no accounts, links, tokens or ids of
the application or server. Tests: `server/test/discordSeed.test.js`; other tests use fixed test
steps (`server/test/helpers/steps.js`), not the shipped ones.

- **Admin → Discord steps** (`/admin/discord`, `client/src/admin/AdminDiscordPage.jsx`; the API
  is `/api/admin/discord`, admins with 2FA, `server/src/discord/adminRoutes.js`; there only while
  Discord is set up). Each ladder is listed with its highest step first:
  - add a step (at the top of its ladder), rename it, set its Discord role id (17-20 digits,
    unique; empty for none), and move it up or down;
  - remove it, unless a room is open from it; the row names those rooms;
  - upload an icon: PNG, WebP or SVG, at most 256 KB. Every icon is drawn once into a 64 × 64
    WebP and only that is kept (`server/src/media/icons.js`, through the chat handle's
    `images.storeIcon`), served from `/media/step-icons/`. An SVG with a DOCTYPE or entities,
    scripts, foreign objects, event attributes, or links or `url()` to anything but its own
    parts is refused. Until an icon is uploaded, a neutral placeholder shows (the ladder's
    shape and the step's initials);
  - or take the icon from a link ("Icon from link", `POST /api/admin/discord/steps/:id/icon-link`
    with `{ url }`, `server/src/discord/iconLink.js`, `client/src/admin/StepIconLink.jsx`):
    https to exactly `cdn.discordapp.com` or `media.discordapp.net`, no redirect at all, an image
    type, 10 seconds, at most the icon limit of 256 KB read (the transfer is cut beyond, with the
    same answer as an oversized upload: `images.iconLimit`, `server/src/media/icons.js`). The
    server fetches it once
    through `safeFetch` (public addresses only, `server/src/previews/safeFetch.js`) and stores it
    through the same `images.storeIcon` as an upload (same checks, same 64 × 64 WebP), so nothing
    depends on Discord afterwards (the fetch reaches the chat area's guard through the chat
    handle's `images.download`, docs/CHAT.md). Refusals name the reason: wrong host, not an image,
    too large, redirected, unreachable;
  - see the role ids on linked members that no step has yet, with how many members carry each
    (ids and counts only), to fill the ids in. In Discord: Developer Mode, then right-click the
    role and choose "Copy Role ID".
  - Every change writes one audit entry (`discord.step_create`, `discord.step_edit`,
    `discord.ladder_reorder`, `discord.step_delete`, `discord.step_icon`).
  - Tests: `server/test/discordAdmin.test.js`, `client/src/admin/adminDiscord.test.jsx`.
- **Reading the roles**: `GET /users/@me/guilds/902220302199689266/member`, with the member's
  consent (scope `guilds.members.read`; no bot on that server). Only `roles` is kept: a JSON list
  of role ids in `discord_links.role_ids`. Steps are computed when they are shown, from those ids
  and the mapping now, so a mapping change shows at once without asking Discord again.
- **When**: at every Discord login and link, with the tokens just given, and **once a day** for
  every linked account (`server/src/discord/refresh.js`). The job looks every minute for links
  whose `next_refresh_at` has passed, reads up to 10, 3 seconds apart, and sets the next read a
  day later plus up to an hour at random, so reads spread over the day. Discord allows a member
  record a burst of 5 reads, then one a minute, per user (the probe); a day's reads for 10,000
  members are about 0.23 a second.
- **The refresh token** is kept so the daily read works without the member. It is sealed like
  2FA secrets (`server/src/discord/tokenBox.js`: secretbox under `SECRET_ENCRYPTION_KEY`, `enc1:`)
  and never logged or shown. Discord **rotates** it: each refresh returns a new one and the old
  one dies at once. So:
  - **one refresh per account at a time**: a claim (`refreshing_since`, released after 2 minutes
    if the server died) makes a second one wait its turn;
  - **the new token is saved the moment Discord gives it** (`keepRefreshToken`, one statement,
    since 2026-11-04), before the member record is read with it; the roles follow in a second
    statement. Only a stop between Discord's answer and that first statement (no network call in
    between, only sealing the token) loses it; the member then logs in with Discord again. No
    ordering closes that last gap: the token exists only in Discord's answer, and the old one is
    dead once Discord has given it.
  - **only into the claimed link**: an unlink or account deletion while Discord answers wins.
    No link comes back, and the new token is revoked at Discord at once.
- **Discord's answers**:
  - `invalid_grant` (the member removed the app, or the token went unused too long): the link is
    marked **needs login**, the token deleted and the steps hidden. The account page says so;
    the next Discord login stores a new token and the steps return;
  - 404 with code **10004**: not on the server. No steps until a later read finds them there.
    The code decides, never the text, which Discord localizes ("Unbekannter Server");
  - 429 or Discord down: the old token still works; the read is retried after `retry_after` (or
    an hour).
- **Access follows** at once: when a read changes a member's steps, their open chat
  connections re-check their rooms (docs/CHAT.md, "Rooms for Discord steps").
- Tests: `server/test/discordRoles.test.js` (sealed token, strict rotation, two refreshes at
  once, an unlink during a read, invalid_grant, 10004, rate limit, the due links only, a mapping change without a read).

### Discord: accounts without a password

An account made with Discord has no password, so "enter your password again" cannot apply to
it. It proves itself with a **fresh Discord login** instead: the callback (`intent=confirm`, or
any Discord login on this session) stamps `discordProofAt` in the session, valid 10 minutes
(`server/src/accounts/identityProof.js`). The session answer carries `discordProofUntil`, so the
page can ask for it in time (`client/src/discord/DiscordConfirmGate.jsx`, "Confirm with
Discord", which comes back to the same page). This proof stands in for the password where the
password is asked: creating or changing the keys (`/api/keys`), setting a first password, and
deleting the account. A taken-over session alone can do none of these.

- **A first password** (`POST /api/auth/password/first`, the account page's "Set a password"):
  only for an account without one, after the proof. It is sent as a salt and auth key like any
  password. The private key, when this device has it open, is sealed for it in the same
  transaction. Every other session ends, as after a password change. From then on the account
  logs in either way, can unlink Discord and can turn on 2FA, which needs a password.
- **The private-message key**: docs/CHAT.md, "Accounts without a password".
- **Deleting** the account needs the proof instead of the password (an account without a
  password has no 2FA either).
- Staff roles are given by the owner only. Staff need 2FA, so an account made with Discord sets a
  password before it can act as staff.

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
  enable/disable; for the login step both per IP and per account of the pending login, since
  2026-11-04: a right password never counts against the login limits, so guesses spread over
  many addresses would otherwise each get fresh tries).
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
| `DELETE /api/auth/account` | 15 min | 5     | account  | failed attempts |
| `POST /api/auth/bootstrap` | 1 h    | 10    | IP       | every attempt   |
| `POST /api/2fa/login`      | 15 min | 5     | IP       | failed codes    |
| `POST /api/2fa/login`      | 15 min | 5     | account  | failed codes    |
| every `GET` under `/api`   | 1 min  | 1200  | IP       | every request   |
| `POST /api/keys/handover`  | 1 h    | 10    | account  | every request   |

`POST /api/auth/prelogin` also shares the two login limiters above (the same counters): a blocked
name or address gets neither salts nor logins. The limit on every read (since 2026-10-21) covers
the public reads that have no limit of their own (session, info, games, calls, chat rooms and
messages, files, the embed check); a page load makes a handful, so only a flood meets it. Routes
with their own limits (bots' reads, member search) keep them as well. `API_READS_PER_MINUTE`
sets it (default 1200). The browser tests raise it (`playwright.config.js`): all their visitors
come from 127.0.0.1, and a run that took under a minute met it (2026-10-23): the call page's one
read was refused, it never asked again, and "Join call" never came. Since 2026-11-02 the call
page asks again after a refusal that passes (429, a server error, no answer).

The per-username login limit is kept as it is on purpose (decided 2026-10-23): anyone who knows a
name can block its logins for 15 minutes with wrong passwords, and a correct password does not
pass the block either. That is the price of stopping guesses spread over many addresses.

The account deletion shares the password change's counter (one limiter, so guesses on either
route count together). The password-change limit keys on the account, not the IP _(race
game)_: people behind one address must not lock each other out. Login is limited twice: per IP, and per username as typed
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
never reset or changed, since an authenticator app uses it. Its last line, "Dev admin ready.",
comes once everything is closed; from there the process ends on its own
(`server/test/devAdminScript.test.js` limits that step, not the whole run).

## Admin: users and the audit log

`/admin` (admins only, with 2FA) manages accounts through `/api/admin/users`: list and search,
change role, grant or revoke "can start games", lock or unlock, reset a password (the admin
sets the new one; all of that user's sessions end), and delete an account (next section).
**The last active admin can be neither demoted nor locked nor deleted** — refused in the data
layer itself (`guardLastAdmin`, `server/src/accounts/userAdmin.js`), so no route can bypass it
_(race game)_; an admin cannot lock their own account either.

Every admin action writes **exactly one** entry to the audit log (who, when, what, target, before
and after, never a password) through the one helper `recordAudit`
(`server/src/audit/auditLog.js`); the Audit page lists it newest first. Every later admin or
moderation action uses the same helper.

## Deleting an account

Decided 2026-11-01: deleting an account deletes its room messages at once (not only after the
chat retention).

- **By the member** (`DELETE /api/auth/account`, `server/src/accounts/deleteRoutes.js`; the
  account page's "Delete my account", `client/src/components/DeleteAccountForm.jsx`): the account
  comes from the session, never the body. It needs the current password as its auth key (never
  the password; as for the password change) and, with 2FA on, a code or a recovery code (the
  same check as turning 2FA off; the code is looked at only after the password is right). Wrong
  ones answer `401 invalid_credentials` and delete nothing; failed attempts count on the password
  change's limiter. The page says in plain words what goes and what stays and asks for a ticked
  confirmation. Afterwards this session ends, the cookie is cleared and the page becomes a
  guest's (which clears the private key kept on the device). Not open to the embedded chat on
  other sites (`403 embed_not_allowed`). Not audited: the account is gone, and the audit log is
  for admin and moderation actions.
- **By an admin** (`DELETE /api/admin/users/:id`, the "Delete" button in the users list after a
  browser confirmation naming the account): writes one audit entry `user.delete` in the same
  transaction (who, when, and the deleted account's username and role in `before`). An admin
  cannot delete their own account there (`409 self_delete`; that is the account page's, with the
  password).
- **The last active admin** cannot be deleted (`409 last_admin`), on either route.
- **What goes, at once, in one transaction** (`deleteAccount`, `server/src/accounts/deletion.js`):
  - by the schemas' `ON DELETE CASCADE` on `users`: the 2FA secret and recovery codes, the keys
    (public and sealed private), favourite rooms and members (both ways), read marks and muted
    rooms, mentions of the account, chat sanctions, the Discord link with its sealed refresh token
    and role ids, every direct message sent or received (so the
    partner's copy of the conversation too), direct files of both partners, direct reports made
    by or about the account with their copies and shared files, embed tokens, call participation
    and call reminders;
  - deleted explicitly, because the schemas keep them (`ON DELETE SET NULL`) or name the account
    only as text: by the chat handle (`chat.accounts.deleteData`, `server/src/chat/accountData.js`,
    as the rest of the server reaches into the chat only through `mountChat()`) the account's
    room messages (call chats included; the reports of them and the mentions in them follow by
    cascade), its room uploads, its room reports (`reporter` is `user:<id>`) and the partners'
    read marks of its conversations (`chat_reads.target_id`); by `deletion.js` its sessions (JSON
    in the `sessions` table);
  - after the commit (`chat.accounts.afterCommit`), the files on disk of those room uploads (with
    thumbnails), direct files and shared report files; and chat pages already open hear which room
    messages went: one `{ type: 'deleted', ids }` per room through the hub's usual push (only to
    sockets that may read the room), and they drop them at once, for moderators too (since
    2026-11-04; `useChatRoom.js`; the home page's Community box asks again).
- **Open sockets** of the account close (`chatSessions.accountChanged`, all of them, embedded
  chats included).
- **The Discord token** is revoked at Discord after the commit (best effort; the token is read
  before the link goes, `revokerFor` in `server/src/discord/index.js`), on both routes. A restore
  that deletes an account again does not revoke, and needs not: that account's grant ended at
  its deletion, older tokens in the backup with it (docs/BACKLOG.md, "Known limits").
- **What stays**: the audit log (entries keep their `actor_name`; `actor_id` becomes empty), call
  recordings and their chapter marks (they name the organiser who started them as text, and hold
  the sound and pictures of whoever spoke or showed a camera or screen), calls the account
  created (`created_by` becomes empty), and staff names noted as text on others' records
  (`hidden_by`, `removed_by`, `reviewed_by`, a sanction's `created_by`). Guests' embed tokens are
  signed, not stored, and belong to no account. Link previews the deleted messages used go with
  the retention job's usual cleanup.
- **The deletion journal** (decided 2026-11-02): after the commit, `deletion.js` notes the
  account's id, username and the time, nothing else, as one line in the journal
  (`server/src/accounts/deletionJournal.js`; `DELETION_JOURNAL`, by default
  `account-deletions.jsonl` beside the database). It lies outside the backups, keeps 30 days
  (older lines go whenever it is written) and lets a restore delete the account again
  (docs/DEPLOYMENT.md, "Restoring"). A failed note is logged loudly; the account is gone either
  way.
- Tests: `server/test/accountDelete.test.js` (the rules), `server/test/deletionJournal.test.js`
  (the journal, and a restore deleting again), `server/test/accountDeleteData.test.js`
  (every kind of data gone, the audit log and recordings kept),
  `client/src/components/deleteAccount.test.jsx`, `client/src/admin/adminPages.test.jsx`,
  `client/e2e/accountDelete.spec.js` (the member's own deletion),
  `client/e2e/accountDeleteAdmin.spec.js` (an admin's, confirmed and dismissed, the audit entry,
  and the refused own Delete).

## Chat identities

Chat guests are not accounts: a guest gets a random name (`Guest-` and six characters a–z, 2–7) held in the session
once they write or report. Registered usernames may not start with "Guest-", so an account can
never look like a guest. Chat moderation (hide, mute, ban) is an organiser/admin action and
therefore needs 2FA like every staff route. Stickers and GIFs are for members only (guests
write text and emojis); `GET /api/chat/media` (the picker's library) is a member route, and the
library itself is managed by admins (with 2FA) at `/api/admin/chat/media`. Removing a link
preview and marking a message's reports reviewed are organiser/admin routes (with 2FA), like
the rest of chat moderation.

## Site banner

Organisers (with 2FA, `allow('organiser')`) change exactly two settings, the site banner's
on/off and text (`banner.enabled`, `banner.text`; decided 2026-11-01), at `/api/banner` and on
the page `/banner`. The banner's link and style, every other setting and the admin route
`/api/admin/settings` stay admin-only; `/api/banner` takes the same two keys from admins. Each change is audited like an admin's
setting change (`setting.change`). Details: docs/SETTINGS.md, "Who".

## The event bot's admin page (/bot-admin/)

The event bot's own admin page is embedded in the site, not rebuilt, and needs no second login
(decided 2026-10-20); organisers may manage events (decided 2026-11-01). The host's nginx serves
`/bot-admin/` on the site's domain and, before every request to it, asks the site
`GET /api/bot-admin/authorize` (an `auth_request` subrequest carrying the browser's own `Cookie`,
`Origin` and `Referer`, plus `X-Original-Method` and `X-Original-URI`;
`server/src/bots/adminAuthorizeRoutes.js`). The bot side and the setup: docs/BOTS.md, "The event
bot's admin page".

- **Only while set up**: `BOT_ADMIN_EMBEDDED=1` (off by default). Off, the route answers `404`.
- **Who**: `allow('organiser')`, the site's own rule. `204` with `X-Acting-User: <username>` for an
  organiser or admin who passed the staff 2FA gate; `401` for a guest, and for a locked account,
  whose session ends on its next request (`sessionUser`, `server/src/http/session.js`, as
  everywhere); `403` for a member and for staff without 2FA (`two_factor_required`). nginx lets
  the request through on `204` only.
- **Changes need the site's Origin**: for `X-Original-Method` `POST`, `PUT`, `PATCH` or `DELETE` the
  browser's `Origin` (or `Referer`) must be the site's own, the CSRF rule above (`originRefusal`,
  `server/src/http/csrf.js`), else `403`. `GET`, `HEAD` and `OPTIONS` only read; any other or a
  missing method is refused (`403 method_unknown`), so a request nobody checked never passes.
- **Audit**: each change let through writes **one** audit entry `bot_admin.change` (actor, target
  type `bot_admin`, target the path of `X-Original-URI` without its query string, at most 300
  characters, after `{ method }`) through `recordAudit`. Never a body, never a header. It records
  that the site let the change through; the bot's own answer is not known to the site.
- **Nothing to leak**: every answer is `Cache-Control: no-store` and repeats no request header. The
  bot's token stays with nginx (a root-only file); the site never has it. Its only rate limit is
  the one on every `GET` under `/api` (below; each request of the bot's page is one), and nothing
  on the route logs a header.
- Tests: `server/test/botAdminAuthorize.test.js` (every answer above, no-store, a fake
  `X-Bot-Admin-Token` never repeated, the audit entry without query or body);
  `client/src/pages/manageEventsPage.test.jsx` and `client/e2e/manageEvents.spec.js` (the item and
  the frame).
- The sidebar's **Manage events** (organisers and admins, while set up) opens `/manage-events`,
  which shows the bot's page `/bot-admin/admin` in a same-origin frame; the client learns that the page is set up from
  the session answer (`features.botAdmin`, `GET /api/auth/session`).

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
