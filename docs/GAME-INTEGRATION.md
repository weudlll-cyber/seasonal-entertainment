# Game integration guide

**Start here when creating a game or adapting an existing standalone game for Seasonal
Entertainment.** This is the entry point for game developers and coding agents: the
architecture, what a game must do, a copyable task brief and the acceptance checklist. The
website's contracts themselves are defined once, in the documents this guide links to; where
the two differ, those documents are right. The game keeps its own repository, installer,
database and game logic.

## Status and scope

The game-side facts below were verified against the default branches on **2026-11-07**:

| Repository                             | Commit                                     |
| -------------------------------------- | ------------------------------------------ |
| `weudlll-cyber/seasonal-entertainment` | `a346182ed0a3f23ca7dbe12ca3c5caf920a9eac3` |
| `weudlll-cyber/seasonal-bingo-royale`  | `0e9eab9f81080e68cb86668c050140bfc770897e` |
| `weudlll-cyber/seasonal-mini-games`    | `5d7ddc6e88de3363b7c6808b02162e3b78ffb664` |

Labels used here:

- **Current**: implemented at those commits.
- **Built**: implemented on the website since then, on `night/2026-11-10` (waiting for the
  merge; decided 2026-11-09).
- **Requested**: asked of the games, their own work.
- **Required**: a requirement for a game adopting this integration.
- **Proposed**: an idea, neither available nor decided.

**Seasonal Race** (`race`) is the third embedded game (decided 2026-11-11). The website's
part is built: the slug in the allowlist, its authorize route and account-changes feed, its
"May host" box, the installer's `RACE` question and `--race`, its feed denied by nginx and
Caddy, and its chat room `race` (the first-start room "Seasonal Race", members read and
write; one race room, decided 2026-11-11). The race's own side is built in its own
repository and was not verified here; nothing on this site changes visibly until the race is
switched on, and its /games card stays "coming soon" until the race is live. The game-side
facts in this guide are Bingo's and Mini Games'.

The website's contracts:

| Contract                                         | Defined in                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Sign-in (authorize), identity headers, decisions | [AUTH.md, "Embedded games"](AUTH.md#embedded-games-gamesslug)                  |
| Account-changes feed, account ids                | [AUTH.md, "Embedded games"](AUTH.md#embedded-games-gamesslug)                  |
| The chat inside a game, its room, postMessage    | [EMBED.md](EMBED.md#the-embedded-games-rooms), [snippet](EMBED.md#the-snippet) |
| Installing: questions, routes folder, token      | [DEPLOYMENT.md, "Embedded games"](DEPLOYMENT.md#embedded-games)                |
| Optional open sign-ups listing                   | [OPEN-ROUNDS.md](OPEN-ROUNDS.md)                                               |

## 1. Architecture and deployment profile

The current profile is for **trusted games operated with the website on the same origin**:
the embedded games are the owner's own, on the same server (decided 2026-11-09).

```text
Browser -> website nginx / Caddy
             /, /api/*, /embed/chat, /ws/chat -> website server
             /games/bingo/*                  -> Bingo server
             /games/mini-games/*             -> Mini Games server
             /games/race/*                   -> race server (its own repository)
```

The browser navigates to the game's own application under `/games/<slug>/`. The website
does not wrap these applications in a game iframe. The game embeds the **website chat** in an
iframe.

| Owner         | Responsibilities                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Website       | Accounts, registration, password/Discord login, website 2FA, website rights, Discord steps, chat and moderation          |
| Reverse proxy | Route requests, ask the website for identity on the sign-in route, overwrite identity headers, add the game proxy secret |
| Game          | Own account mapping, sessions, authorization, game state, results, leaderboards, local standalone login                  |

Required: support `local` and `website` modes. In website mode players authenticate through
the website, without a second registration; disable local registration/password sign-in and
do not offer password management for passwordless website accounts. Standalone behavior
remains independent of the website. Guests may use the game's explicitly public read-only
features; joining, hosting and other member actions require server-side authorization.

Required: all assets, API routes, WebSockets, redirects and cookies work under the configured
base path. Do not hard-code root paths such as `/api` for a game hosted under `/games/<slug>/`.
Keep game rules independent of the identity and chat adapters.

## 2. Signing in through the website

The contract (routes, methods, the same-origin rule, every header and its value) is in
[AUTH.md, "Embedded games"](AUTH.md#embedded-games-gamesslug). In short:

```text
1. Browser GET /games/<slug>/auth/website?next=<encoded game page>
2. Proxy asks GET /api/games/<slug>/authorize with the browser's website cookie,
   Host, Origin and X-Original-Method.
3. Website answers 204: the X-Acting-User-* headers for a member in good standing, or
   X-Acting-Guest: true alone for anyone else (never 401).
4. Proxy forwards that answer's identity headers and its own game-specific secret.
5. Game validates the trusted connection, maps the account, rotates its own session,
   and redirects to the requested game page.
```

Only the exact game sign-in route receives trusted identity headers; other game routes use
the game's own session. A 204 alone is not a sign-in: only the member headers are.

- **`X-Acting-User-Can-Host`** answers for the game asking (**built**: hosting is granted per
  game by an admin; admins always may). A grant for one game is no grant for another.
- **`X-Acting-User-Steps`**: required, validate the decoded structure, bound its size, and never
  treat an icon as arbitrary HTML or an unrestricted external URL; invalid optional steps must
  not grant rights.
- **`X-Acting-User-Email-Verified`** is the games' scoring-eligibility convention, not proof of
  an email check; no email address is sent.

Required trust checks: read identity headers only in website mode and only on the dedicated
sign-in route. Check the actual TCP peer against the configured trusted proxy
addresses/CIDRs, not a browser-supplied forwarding header, and a game-specific proxy secret
in constant time; without either, refuse sign-in. Current secret headers: Bingo
`X-Sbr-Proxy-Secret`, Mini Games `X-Smg-Proxy-Secret`. The proxy overwrites or clears the
identity and secret headers clients send; the secret is added after authorization, never sent
to the website. Keep secrets out of source control, browser responses, status output and logs.

Required game login hop:

```text
GET /games/<slug>/auth/website/login?next=<encoded game page>
  -> /login?next=<encoded /games/<slug>/auth/website?next=...>
```

Encode each nested query parameter separately, including any URL fragment. The website keeps
`next` through login, registration and Discord login, and opens a `/games/...` return path
with a full page load (AUTH.md). Accept only local return paths under the game's base path;
reject schemes, external hosts, `//`, backslashes and invalid characters. Both games bound
`next` to 512 printable ASCII characters and fall back to the lobby.

## 3. Account mapping, rights and sessions

Required account key: **(website origin, website user ID)**. Never link automatically by
username or email. On first sign-in create a game account without a local password or email.
On later sign-ins follow the website display name, resolve game-name collisions, update steps
and recompute website-derived roles; the stable identity survives a rename.

| Website input                  | Current game mapping in both games |
| ------------------------------ | ---------------------------------- |
| Member account                 | `player`                           |
| `X-Acting-User-Can-Host: true` | `organizer`                        |
| `admin`                        | `game_admin`                       |
| `organiser` alone              | No additional hosting right        |

Never map website claims to `super_admin` or `security_admin`. Track mapped assignments
separately from game-managed ones, so recomputing them neither keeps a revoked mapped right
nor deletes an unrelated local assignment. Enforce permissions on the server.

Each game creates and rotates its **own** session: a unique HttpOnly, Secure, SameSite=Lax
cookie scoped to the game path in production, and its own CSRF protection for state-changing
requests. Current: in website mode a game session lasts **7 days** in both games. The website
session is not a substitute for a game session.

**Trust limitation:** same-origin applications are not isolated from each other. **Requested**
(2026-11-09, from both games): the games' own route files strip the website's cookies before
forwarding to the game server. Until a game has done so, its server may receive the website
session cookie, though it never uses it as login proof. If a game not run by the owner is ever
embedded, a separate origin and per-game capabilities and sync tokens come back on the table
(docs/BACKLOG.md, "Known limits").

## 4. Account changes and session revocation

The feed (request, answer, kinds, cursor, paging, token, rate limit, where it is reachable) is
in [AUTH.md, "Embedded games"](AUTH.md#embedded-games-gamesslug). One website journal serves
all enabled games; each game keeps its own cursor and fetches pages until caught up.

Required: persist the cursor only after successful processing, and make processing safe to
repeat. What the games do today:

| Kind       | Current consequence in the games                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locked`   | Revoke the linked player's game sessions and close their live connections                                                                          |
| `rights`   | Same; the next sign-in recomputes rights                                                                                                           |
| `unlocked` | Bingo revokes sessions; Mini Games takes no additional action                                                                                      |
| `deleted`  | Revoke sessions, remove/anonymize personal account data, exclude from active leaderboards; keep historical results under a deleted-player identity |

The website sends `rights` for a role change, a change of who may host that game, and
(**built**) a member's password change or an admin's password reset, so whoever knew the old
password is signed out of the games too; not for the first password of an account made with
Discord. Bingo also remembers deleted website identities to refuse their later sign-in; Mini
Games keeps an anonymized account marked deleted and removes its external identity link.

Current polling: Bingo every two minutes; Mini Games normally every 15 seconds, with backoff
on failure. These are not immediate revocations; both keep playing when the feed fails and
log the failure rather than enforcing a maximum delay. The website keeps 365 days of changes;
a game offline longer cannot assume a complete history. Decided 2026-11-09: no shorter limit,
polling suffices; a normal website logout ends only the website session, and "sign out
everywhere" or per-device logout are not planned.

## 5. The website chat inside a game

The embed (its URL, the game's room and its defaults, framing, postMessage messages and the
snippet) is in [EMBED.md](EMBED.md#the-embedded-games-rooms). In short: frame
`/embed/chat?room=<slug>&theme=<light|dark|auto>`; it signs in with the **website session**,
not the game's, so it may show a member before the game has a session. The website makes one
room per game (not per match) while the game is switched on; the race's room `race` is the
first-start room "Seasonal Race", there before the race is switched on, with its own rules
(members read and write): it embeds `/embed/chat?room=race&theme=auto`.

Required: allow the iframe in the game's `frame-src` CSP; keep a referrer (`strict-origin`)
so Firefox can identify the parent; if sandboxing, keep what the chat and its login popup need.
Validate `event.origin`, `event.source === iframe.contentWindow`, `data.source` and the fields
used; send only to the chat's explicit origin, never `'*'`; re-send the current visibility on
`ready`, and keep the iframe mounted while hidden if it must count arrivals.

Current: Bingo embeds the chat and follows theme changes but does not use the unread and
visibility messages; Mini Games uses them behind the round view's Chat button. Both keep game
announcements in their own UI; neither posts winners into the website room.

## 6. Website setup and the optional open-rounds listing

Three separate steps, not one switch (details in
[DEPLOYMENT.md, "Embedded games"](DEPLOYMENT.md#embedded-games)):

1. **Register and enable the integration.** The slugs are a fixed list
   (`server/src/games/embedded.js`: `bingo`, `mini-games`, `race`); the installer's question switches a
   game on (`GAMES_EMBEDDED`). A new game also needs its entry in `deploy/install/lib/games.sh`
   and its feed denied in `deploy/site/Caddyfile`, with docs and tests; an environment value or
   a game card alone is not enough.
2. **Install the game.** Its installer writes its own route file into the website's prepared
   routes folder (nginx `/etc/seasonal/routes/*.conf`, or `/etc/caddy/routes/*.caddy`), keeps
   files holding secrets 0600, validates the proxy configuration before a reload and restores
   the previous route if the check fails. It never changes website-owned files.
3. **Create the catalogue card** in Admin → Games (path `/games/<slug>`, no trailing slash).
   Card visibility and maintenance status are presentation, not route authorization.

Optional: the [open-rounds contract](OPEN-ROUNDS.md), its HTTPS status URL in the card's
"Sign-up status URL". Current: Bingo provides `/games/bingo/api/public/open-rounds`; Mini Games
does not expose it.

## 7. Other profiles and proposals

**Not the current website login:** Mini Games also implements a third-party game iframe loader
and JWT handoff; Bingo's loader is a placeholder; OIDC is not implemented. Do not copy them as
working website capabilities. The chat separately supports approved foreign sites with its own
popup and embed token, which authorizes website chat, not a game ([EMBED.md](EMBED.md)).

| Idea                                                                | Status                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Strip the website's cookies before forwarding to game servers       | Requested from both games (2026-11-09)                                  |
| Revocation events for a password change or reset                    | Built (`rights`); sign-out everywhere and per-device logout not planned |
| Freshness limits for privileged actions on feed failure             | Rejected (2026-11-09): the 365-day feed and polling suffice             |
| Hosting granted per game                                            | Built                                                                   |
| Per-game capabilities beyond hosting; a sync token per game         | Not needed while the games are the owner's (2026-11-09)                 |
| Versioned identity/feed contracts with shared executable tests      | Proposed                                                                |
| One registration list for server, installer and proxy               | Proposed                                                                |
| A separate-origin profile (e.g. OIDC with PKCE) for untrusted games | Proposed; needed only for a game not run by the owner                   |

## 8. Copyable task brief for a game repository

Use this with the chosen slug and repository. It is an implementation brief, not a claim that
the website already knows arbitrary slugs.

```text
Integrate this standalone game with Seasonal Entertainment.
Reference: weudlll-cyber/seasonal-entertainment, docs/GAME-INTEGRATION.md (start there),
then docs/AUTH.md "Embedded games", docs/EMBED.md and docs/DEPLOYMENT.md "Embedded games".
Game slug: <slug>. Public base path: /games/<slug>/.
Profile: trusted same-origin application with proxy-header login and website chat.

Preserve local standalone behavior. Add a website identity adapter and disable local
registration/password login in website mode. Implement auth/website and its login hop,
validate TCP proxy trust plus a game-specific secret, map (website origin, user ID),
recompute mapped rights (Can-Host is for this game), and create a rotated game session
scoped to the base path. Keep authentication, authorization and game rules separate.

Process the internal account-changes feed with a durable cursor and repeat-safe handling;
revoke sessions and live connections on lock/rights changes and anonymize deletions.
Document polling delays and failure behavior.

Embed /embed/chat?room=<slug> with theme and safe seasonal-chat postMessage handling.
Do not copy website passwords, private-message keys or chat state into the game.
Make assets, APIs, WebSockets, redirects and cookies work under the base path.

Provide an installer-owned nginx/Caddy route that strips the website's cookies, and document
configuration without secrets. Coordinate website slug registration, activation, feed
protection and catalogue setup. Optionally implement docs/OPEN-ROUNDS.md. Do not assume OIDC,
a website JWT issuer, a season feed, embedded calls or per-match website chat rooms.
Use the acceptance checklist below; report remaining gaps explicitly.
```

## 9. Acceptance checklist

Add game-specific automated checks and exercise the real proxy path before deployment.

- [ ] Standalone registration/login and existing game behavior still work.
- [ ] Every game page, asset, API call and WebSocket works under the base path.
- [ ] Website member sign-in creates/reuses the correct account without a second registration.
- [ ] Login, registration and Discord login return to the requested game page/fragment.
- [ ] External or malformed return paths cannot redirect outside the game.
- [ ] Direct identity injection, wrong secrets and untrusted TCP peers cannot sign in.
- [ ] Guests can only use intended reads; member/host/admin actions are protected server-side.
- [ ] Hosting follows `Can-Host` for this game, not `organiser` alone; high-privilege roles
      cannot be mapped.
- [ ] Name/steps changes follow the next sign-in without changing the identity link.
- [ ] Locks, rights changes and password changes/resets revoke sessions and sockets within the
      documented healthy-feed delay.
- [ ] Deletion removes personal display data and active board entries without losing
      historical scores.
- [ ] Cursor survives restart; replayed pages are safe; feed errors are observable without
      secrets.
- [ ] The route file strips the website's cookies; cookie scope, CSRF checks and logout
      behavior match the documented session policy.
- [ ] Chat works for website guests/members, on phones and desktops, and in Firefox.
- [ ] Theme, hidden-panel arrivals and unread reset work where the chat badge is offered.
- [ ] Foreign-origin/window messages and malformed postMessage fields are ignored.
- [ ] Proxy config validation/rollback and separate catalogue setup work.
- [ ] Optional status feed meets exact field/size/origin rules and excludes closed/private
      rounds.

## 10. Source map and maintenance

Website code:

- Identity endpoints: `server/src/games/embeddedRoutes.js`; who may host:
  `server/src/accounts/gameHosts.js`
- Allowed slugs: `server/src/games/embedded.js`; activation: `server/src/config.js`
- Journal and non-reused ids: `server/src/accounts/accountChanges.js`, `accountIds.js`
- Rooms: `server/src/chat/seed.js`; framing: `server/src/http/securityHeaders.js`
- Chat messages: `client/src/embed/embedProtocol.js`
- Login return navigation: `client/src/session/nextPage.js`
- Installation: `deploy/install/lib/games.sh`, `deploy/site/Caddyfile`
- Catalogue/status: `server/src/games/adminRoutes.js`, `seed.js`, `openRoundsContract.js`
- Website tests: `server/test/embeddedGames.test.js`, `embeddedFeed.test.js`,
  `gameHosts.test.js`, `gameRooms.test.js`, `openRounds.test.js`; chat browser cases in
  `client/e2e/embed*.spec.js`; installer checks in `deploy/test/games.test.sh`

Game-side reference implementations at the verified commits:

- [Bingo sign-in](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/apps/server/src/http/routes/websiteSignIn.ts),
  [identity mapping](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/apps/server/src/auth/websiteIdentity.ts),
  [proxy route](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/ops/lib/websiteRoute.sh),
  [chat](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/apps/web/src/shell/ChatDock.tsx)
- [Mini Games sign-in](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/server/src/http/routes/websiteSignIn.ts),
  [account feed](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/server/src/integration/accountFeed.ts),
  [account changes](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/server/src/integration/accountChanges.ts),
  [chat protocol](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/web/src/chat/useHostChatFrame.ts)

When a website contract changes, change its defining document (AUTH, EMBED, DEPLOYMENT,
OPEN-ROUNDS) and this guide's summary in the same change. Coordinate consumer changes in the
game repositories before deploying a breaking change. Refresh the verified snapshot and keep
proposals labelled apart from what is built. Game agents start with this guide, then read only
the sources relevant to their task.
