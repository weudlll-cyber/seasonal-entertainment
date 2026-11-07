# Game integration guide

**Start here when creating a game or adapting an existing standalone game for Seasonal
Entertainment.** This is the shared entry point for game developers and coding agents:
architecture, website contracts, implementation checklist and known limitations in one place.
The game keeps its own repository, installer, database and game logic.

## Status and scope

Verified against the default branches on **2026-11-07**:

| Repository                             | Commit                                     |
| -------------------------------------- | ------------------------------------------ |
| `weudlll-cyber/seasonal-entertainment` | `a346182ed0a3f23ca7dbe12ca3c5caf920a9eac3` |
| `weudlll-cyber/seasonal-bingo-royale`  | `0e9eab9f81080e68cb86668c050140bfc770897e` |
| `weudlll-cyber/seasonal-mini-games`    | `5d7ddc6e88de3363b7c6808b02162e3b78ffb664` |

This describes repository behavior, not proof of a live deployment. **Current** means
implemented at those commits. **Required** means a requirement for a game adopting this
integration. **Proposed** means an improvement, not an available website capability or an
approved implementation decision. Recheck the relevant source when updating a contract;
do not treat older game specifications as overriding current website behavior.

## 1. Architecture and deployment profile

The current profile is for **trusted games operated with the website on the same origin**.

```text
Browser -> website nginx / Caddy
             /, /api/*, /embed/chat, /ws/chat -> website server
             /games/bingo/*                  -> Bingo server
             /games/mini-games/*             -> Mini Games server
```

The browser navigates to the game's own application under `/games/<slug>/`. The website
does not currently wrap these applications in a game iframe. The game embeds the
**website chat** in an iframe.

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

## 2. Website sign-in contract

### Routes and sequence

```text
1. Browser GET /games/<slug>/auth/website?next=<encoded game page>
2. Proxy asks GET /api/games/<slug>/authorize with the browser's website cookie,
   Host, Origin and X-Original-Method.
3. Website answers with member headers or a guest header.
4. Proxy forwards that answer's identity headers and its own game-specific secret.
5. Game validates the trusted connection, maps the account, rotates its own session,
   and redirects to the requested game page.
```

Only the exact game sign-in route receives trusted identity headers. Other game routes use
the game's own session, without asking the website again.

The authorize endpoint itself accepts GET only (other methods: 405). The original browser
method must be supplied: GET, HEAD and OPTIONS are accepted; state-changing methods require
the website's own Origin; unknown/missing original methods or an invalid required Origin
give 403. Disabled or unknown game slugs give 404. Responses are `Cache-Control: no-store`.

### Member and guest answers

A website member in good standing receives **204 with no body** and:

| Header                         | Contract                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `X-Acting-User-Id`             | Website account ID as text; currently numeric and never reused                     |
| `X-Acting-User`                | Website username                                                                   |
| `X-Acting-User-Roles`          | Currently one of `member`, `organiser`, `admin`; existing games parse a comma list |
| `X-Acting-User-Email-Verified` | Currently `true` for every member in good standing                                 |
| `X-Acting-User-Can-Host`       | `true` or `false`; website's "Can start games" flag, always true for admins        |
| `X-Acting-User-Steps`          | Base64URL of compact JSON, highest Discord step per ladder, at most three          |

The verification header is the existing **game scoring eligibility convention**, not proof
of an email verification message. No email address is transmitted.

Decoded steps example (encode this array as Base64URL before putting it in the header):

```json
[
  {
    "ladder": "holder",
    "name": "Golden",
    "icon": "/media/step-icons/0123456789abcdef0123456789abcdef.webp"
  }
]
```

Ladders: `holder`, `farmer`, `investor`. Icon: public website-relative path or null.
Without steps the array is `[]`. No Discord tokens or private keys are handed to the game.
Required: validate the decoded structure, bound its size, and never treat an icon as arbitrary
HTML or an unrestricted external URL. Invalid optional steps must not grant rights.

Signed-out users, locked accounts and accounts blocked by website 2FA requirements receive
**204 with only `X-Acting-Guest: true`**, without member headers. Therefore a successful
HTTP status is not sufficient to sign someone in. Normal guests are not a 401 error.

### Trust checks and return paths

Required: read identity headers only in website mode and only on the dedicated sign-in route.
Check the actual TCP peer against the configured trusted proxy addresses/CIDRs, not a
browser-supplied forwarding header. Also check a game-specific proxy secret in constant time.
Without either trust check, refuse sign-in.

Current secret headers: Bingo `X-Sbr-Proxy-Secret`, Mini Games `X-Smg-Proxy-Secret`.
The proxy overwrites/clears the configured identity and secret headers received from clients;
the secret is added after authorization, not sent as part of the website identity request.
Keep secrets out of source control, browser responses, status output and logs.

Required game login hop:

```text
GET /games/<slug>/auth/website/login?next=<encoded game page>
  -> /login?next=<encoded /games/<slug>/auth/website?next=...>
```

Encode each nested query parameter separately, including any game URL fragment. Preserve
the return path through registration and Discord login too. Accept only local return paths
under the game's base path; reject schemes, external hosts, `//`, backslashes and invalid
characters. Existing games bound `next` to 512 characters and printable ASCII and fall back
to the lobby. The website already uses a full page navigation for `/games/...` return paths,
not its internal SPA router.

## 3. Account mapping, rights and sessions

Required account key: **(website origin, website user ID)**. Never automatically link by
username or email. On first sign-in create a game account without a local password or email.
On later sign-ins follow the website display name, resolve game-name collisions, update
steps, and recompute website-derived roles. Stable identity must survive a rename.

| Website input                  | Current game mapping in both games |
| ------------------------------ | ---------------------------------- |
| Member account                 | `player`                           |
| `X-Acting-User-Can-Host: true` | `organizer`                        |
| `admin`                        | `game_admin`                       |
| `organiser` alone              | No additional hosting right        |

Never map website claims to `super_admin` or `security_admin`. Track mapped assignments
separately from game-managed assignments so recomputing them does not retain revoked mapped
rights or delete unrelated local assignments. Enforce permissions on the server.

Each game creates and rotates its **own** session. Use a unique HttpOnly, Secure,
SameSite=Lax cookie scoped to the game path in production, and the game's own CSRF protection
for state-changing requests. The website session is not a substitute for a game session.
Bingo caps website player sessions at seven days; do not assume both games have identical
session lifetimes.

**Trust limitation:** same-origin apps are not isolated security boundaries. The current
game proxy routes do not explicitly filter the website session cookie out of all forwarded
requests. The game does not use it as its login proof, but it may still reach the game server.
Do not claim that the website cookie is technically never visible there.

## 4. Account changes and session revocation

Current internal, server-to-server contract:

```http
GET /api/games/<slug>/account-changes?since=118
X-Games-Sync-Token: <operator-provided sync token>
```

```json
{
  "changes": [
    { "id": 42, "kind": "locked" },
    { "id": 17, "kind": "deleted" }
  ],
  "next": "120"
}
```

One website journal serves all enabled games; each game persists its own cursor. Missing
`since` or `0` starts from the beginning; cursors supplied to the website are 1-15 digits.
At most 500 changes per page; fetch subsequent pages using `next` until caught up. Persist
the cursor only after successful processing, and make processing safe to repeat.

| Kind       | Current consequence                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locked`   | Revoke the linked player's game sessions and close their live connections                                                                          |
| `rights`   | Same; the next sign-in recomputes rights                                                                                                           |
| `unlocked` | Bingo revokes sessions; Mini Games takes no additional action                                                                                      |
| `deleted`  | Revoke sessions, remove/anonymize personal account data, exclude from active leaderboards; keep historical results under a deleted-player identity |

Bingo also remembers deleted website identities to reject their later sign-in. Mini Games
keeps an anonymized account marked deleted and removes its external identity link.

The website records changes transactionally and retains them for 365 days. Unknown game
accounts need no update. A game offline beyond that retention cannot assume its cursor
provides a complete history: reconciliation would need an additional mechanism.

Current polling: Bingo every two minutes; Mini Games normally every 15 seconds, with
failure backoff. These are not immediate revocations. Both keep playing on feed failures
and expose/log failures rather than providing a strict maximum revocation delay.

The shared token is generated once at `/etc/seasonal/games-sync-token` (root-only, 0600),
passed to the website as `GAMES_SYNC_TOKEN`, and copied by game installers into protected
configuration. Wrong/missing token: 401; invalid cursor: 400; disabled game: 404;
rate limit: 60 requests/minute per game and address. The public proxy denies the feed.
Use the website's private address: container network `http://site:3800`, or the operator's
local port recorded in `/etc/seasonal/site-local-port` where applicable.

**Not implemented:** complete single logout. Normal website logout, password changes and
password resets are not journal events in this contract. Do not promise that those actions
immediately revoke existing game sessions.

## 5. Website chat contract

The game frames the website's chat, which authenticates with the **website session**, not the
game session. It can therefore show a logged-in member before the game has a player session.
Chat rules, moderation and private-message key handling stay with the website.

```html
<iframe
  id="website-chat"
  title="Chat"
  src="/embed/chat?room=YOUR-SLUG&theme=auto"
  referrerpolicy="strict-origin"
  style="width: 100%; height: 32rem; border: 0"
></iframe>
```

Theme: `light`, `dark` or `auto`. Required: allow the iframe in the game's `frame-src` CSP.
The website permits same-origin parents on `/embed/` through `frame-ancestors 'self'`;
same-origin games need no external embed approval. Preserve a suitable referrer so Firefox
can identify the parent. If sandboxing, preserve the capabilities needed by the chat and
its login flow; test the resulting configuration, especially navigation and popups.

The website creates a room with the enabled game's slug on startup if missing: everyone
reads, members write, guests cannot write by default. Thereafter admins manage it as an
ordinary room. Disabling a game does not delete its room/messages; deleting or renaming
that room makes the expected slug reappear with defaults on a later enabled startup.
There is one website room per game, not automatically one per match.

### postMessage protocol

| Direction    | Message                                                      |
| ------------ | ------------------------------------------------------------ |
| Chat -> game | `{ source: 'seasonal-chat', type: 'ready', room, signedIn }` |
| Chat -> game | `{ source: 'seasonal-chat', type: 'unread', room, count }`   |
| Chat -> game | `{ source: 'seasonal-chat', type: 'resize', height }`        |
| Game -> chat | `{ source: 'seasonal-chat-host', type: 'visible', visible }` |
| Game -> chat | `{ source: 'seasonal-chat-host', type: 'theme', theme }`     |

`room` is the actual selected room or null. `unread` counts arrivals while the game reports
`visible: false`, resets when visible, and is not the entire account's unread total.
`height` is pixels. No token, private key or message text is sent to the game.

Required: validate `event.origin`, `event.source === iframe.contentWindow`, `data.source`
and the fields used. Send only to the chat's explicit origin, never `'*'`. Re-send current
visibility on `ready` and keep the iframe mounted while hidden if it must count arrivals.
Use the website's [complete snippet and embed rules](EMBED.md#the-snippet).

Bingo currently embeds the chat and follows theme changes but its `ChatDock` does not consume
the unread/visibility protocol. Mini Games implements that protocol behind the round-view
Chat button, not in every lobby/waiting view. Both keep game announcements in their own UI;
neither posts winners automatically into the website room.

## 6. Website setup and optional open-rounds listing

These are three separate steps, not one switch:

1. **Register and enable the integration.** Current fixed slugs: `bingo`, `mini-games`.
   `GAMES_EMBEDDED=bingo,mini-games` enables website authorize/feed routes and room creation.
   Unknown slugs currently stop startup. For a new game extend
   `server/src/games/embedded.js`, the list and activation handling in
   `deploy/install/lib/games.sh`, and public feed-denial rules in `deploy/site/Caddyfile`.
   Update related docs and tests. Merely adding an environment value or a game card is not enough.
2. **Install the game.** Its installer writes its own route file into the website's prepared
   nginx include directory `/etc/seasonal/routes/*.conf`, or the directory mounted as
   `/etc/caddy/routes/*.caddy`. Keep route files containing secrets 0600; validate the proxy
   configuration before reload and restore the previous route on validation failure.
   Route HTTP and WebSockets to the game without changing website-owned files.
3. **Create the catalogue card in Admin -> Games.** Set name, description, image, status,
   visibility and path `/games/<slug>` (no trailing slash in the card). The current seed
   does not automatically add Bingo or Mini Games cards. Card visibility and maintenance
   status are presentation, not a substitute for game route authorization.

Optional: provide the website's [open-rounds contract](OPEN-ROUNDS.md) and put its HTTPS
status URL in the card's "Sign-up status URL" field:

```json
{
  "version": 1,
  "rounds": [
    {
      "id": "round-123",
      "title": "Evening round",
      "kind": "My game",
      "startsAt": null,
      "signupClosesAt": null,
      "players": 12,
      "maxPlayers": 100,
      "joinUrl": "https://website.example/games/my-game/#/match/ABC123"
    }
  ]
}
```

Public, no personal data, at most 20 currently open host-approved entries, JSON and
`Cache-Control: public, max-age=30`. String limits: ID 64, title 80, kind 40 characters.
Dates are ISO UTC ending in `Z` or null; players is a nonnegative integer; maxPlayers is
a positive integer or null. The join URL must be absolute HTTPS on the status URL's origin.
The website polls every 60 seconds and retains the last good answer for at most three minutes.
It uses a guarded public HTTPS fetch (port 443, no redirects, public addresses, five-second
timeout, 64 KB limit); do not configure this field with a private container address.

Bingo provides `/games/bingo/api/public/open-rounds`. Mini Games does not currently expose
this shared open-rounds endpoint; its other public APIs are not interchangeable with it.

## 7. Other profiles and proposed improvements

**Not the current website login:** Mini Games additionally implements a third-party game
iframe loader and JWT handoff. Bingo's comparable loader is still a placeholder. OIDC is
not implemented for the current website integration. Do not copy planned Bingo JWT/embed
examples as working website capabilities.

The chat separately supports approved foreign origins using its own popup and embed token.
That token authorizes website chat, not a game. See [EMBED.md](EMBED.md).
The proposed website season feed is not implemented, and Bingo's stored call reference
does not yet render an embedded website call. Neither is a prerequisite for integration.

Recommended follow-ups, **proposed and not implemented by this document**:

| Improvement                                                         | Purpose                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Filter website cookies before forwarding to game servers            | Reduce unnecessary exposure; does not make same-origin games isolated                 |
| Add explicit cross-game session revocation events                   | Cover password reset/change and "sign out everywhere"; decide normal logout semantics |
| Define feed freshness limits for privileged actions                 | Avoid retaining administrative rights indefinitely during synchronization failure     |
| Version identity/feed contracts and share executable contract tests | Prevent incompatible changes and divergent adapters                                   |
| Give games separate sync credentials                                | Reduce the scope of compromise; current token is shared                               |
| Consolidate game registration metadata                              | Avoid independently maintained server/installer/proxy lists                           |
| Grant explicit per-game administrative capabilities                 | Avoid automatically giving every website admin broad rights in every game             |

For independently operated or untrusted games, use a separate-origin profile rather than
treating a website subpath as isolation. Standard OIDC Authorization Code + PKCE is a
candidate for that future profile; it requires website/provider work and is not available
just by changing a game setting.

## 8. Copyable task brief for a game repository

Use this with the chosen slug and repository. It is an implementation brief, not a claim
that the website already knows arbitrary slugs.

```text
Integrate this standalone game with Seasonal Entertainment.
Reference: weudlll-cyber/seasonal-entertainment, docs/GAME-INTEGRATION.md.
Game slug: <slug>. Public base path: /games/<slug>/.
Profile: trusted same-origin application with proxy-header login and website chat.

Preserve local standalone behavior. Add a website identity adapter and disable local
registration/password login in website mode. Implement auth/website and its login hop,
validate TCP proxy trust plus a game-specific secret, map (website origin, user ID),
recompute mapped rights, and create a rotated game session scoped to the base path.
Keep authentication, authorization and game rules separate.

Process the internal account-changes feed with a durable cursor and repeat-safe handling;
revoke sessions and live connections on lock/rights changes and anonymize deletions.
Document polling delays, failure behavior and the lack of complete single logout.

Embed /embed/chat?room=<slug> with theme and safe seasonal-chat postMessage handling.
Do not copy website passwords, private-message keys or chat state into the game.
Make assets, APIs, WebSockets, redirects and cookies work under the base path.

Provide an installer-owned nginx/Caddy route and document configuration without secrets.
Coordinate website slug registration, activation, feed protection and catalogue setup.
Optionally implement docs/OPEN-ROUNDS.md. Do not assume OIDC, a website JWT issuer,
season feed, embedded calls or per-match website chatrooms are already available.
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
- [ ] Hosting follows `Can-Host`, not `organiser` alone; high-privilege roles cannot be mapped.
- [ ] Name/steps changes follow the next sign-in without changing the identity link.
- [ ] Locks/rights changes revoke sessions and sockets within the documented healthy-feed delay.
- [ ] Deletion removes personal display data and active board entries without losing historical scores.
- [ ] Cursor survives restart; replayed pages are safe; feed errors are observable without secrets.
- [ ] Cookie scope, CSRF checks and logout behavior match the documented session policy.
- [ ] Chat works for website guests/members, on phones and desktops, and in Firefox.
- [ ] Theme, hidden-panel arrivals and unread reset work where the chat badge is offered.
- [ ] Foreign-origin/window messages and malformed postMessage fields are ignored.
- [ ] Proxy config validation/rollback and separate catalogue setup work.
- [ ] Optional status feed meets exact field/size/origin rules and excludes closed/private rounds.

## 10. Source map and maintenance

Website contracts and operations:

- [AUTH.md, embedded games](AUTH.md#embedded-games-gamesslug)
- [EMBED.md](EMBED.md), [OPEN-ROUNDS.md](OPEN-ROUNDS.md),
  [DEPLOYMENT.md, embedded games](DEPLOYMENT.md#embedded-games)
- Identity endpoints: `server/src/games/embeddedRoutes.js`
- Allowed slugs: `server/src/games/embedded.js`; activation: `server/src/config.js`
- Journal and non-reused IDs: `server/src/accounts/accountChanges.js`, `accountIds.js`
- Rooms: `server/src/chat/seed.js`; framing: `server/src/http/securityHeaders.js`
- Chat messages: `client/src/embed/embedProtocol.js`
- Login return navigation: `client/src/session/nextPage.js`
- Installation: `deploy/install/lib/games.sh`, `deploy/site/Caddyfile`
- Catalogue/status: `server/src/games/adminRoutes.js`, `seed.js`, `openRoundsContract.js`
- Website tests: `server/test/embeddedGames.test.js`, `embeddedFeed.test.js`,
  `gameRooms.test.js`, `openRounds.test.js`; chat browser cases in `client/e2e/embed*.spec.js`;
  installer checks in `deploy/test/games.test.sh`

Game-side reference implementations at the verified commits:

- [Bingo sign-in](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/apps/server/src/http/routes/websiteSignIn.ts),
  [identity mapping](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/apps/server/src/auth/websiteIdentity.ts),
  [proxy route](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/ops/lib/websiteRoute.sh),
  [chat](https://github.com/weudlll-cyber/seasonal-bingo-royale/blob/0e9eab9f81080e68cb86668c050140bfc770897e/apps/web/src/shell/ChatDock.tsx)
- [Mini Games sign-in](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/server/src/http/routes/websiteSignIn.ts),
  [account feed](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/server/src/integration/accountFeed.ts),
  [account changes](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/server/src/integration/accountChanges.ts),
  [chat protocol](https://github.com/weudlll-cyber/seasonal-mini-games/blob/5d7ddc6e88de3363b7c6808b02162e3b78ffb664/apps/web/src/chat/useHostChatFrame.ts)

When changing a website contract, update this guide and the detailed contract document in
the same change. Coordinate consumer changes in game repositories before deploying a breaking
change. Refresh the verified snapshot and label new proposals separately from implemented
behavior. Game agents should start with this guide, then read only the sources relevant to
their task rather than rediscovering the architecture across all repositories.
