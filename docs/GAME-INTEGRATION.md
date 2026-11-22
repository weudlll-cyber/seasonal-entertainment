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
- **Built**: implemented on the website since then and merged into `master`: `night/2026-11-10`
  (PR #55, merged 2026-11-10 as c9980a7; decided 2026-11-09).
- **Requested**: asked of the games, their own work.
- **Required**: a requirement for a game adopting this integration.
- **Proposed**: an idea, neither available nor decided.

**Seasonal Race** (`race`) is the third embedded game (decided 2026-11-11). The website's
part is built: the slug in the allowlist, its authorize route and account-changes feed, its
"May host" box, the installer's `RACE` question and `--race`, its feed denied by nginx and
Caddy, and its chat room `race` (the first-start room "Seasonal Race", members read and
write; one race room, decided 2026-11-11). The race's own side is built in its own
repository and was not verified here; nothing on this site changes visibly until the race is
switched on, and its /games card stays "coming soon" until the race is live.

**Seasonal Cases** (`cases`) is the fourth embedded game (decided 2026-11-21). The website's
part is built the same way: the slug in the allowlist, its authorize route and account-changes
feed, its "May host" box, the installer's `CASES` question and `--cases`, its feed denied by
nginx and Caddy, and its chat room `cases` ("Seasonal Cases"), added like Bingo's and Mini
Games' while the game is switched on. Cases' own side (sign-in at `/games/cases/auth/website`,
the feed, open rounds) is built in its own repository and was not verified here; it has no
member summary and no installer or route file yet. The game-side facts in this guide are
Bingo's and Mini Games'.

The website's contracts:

| Contract                                         | Defined in                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Sign-in (authorize), identity headers, decisions | [AUTH.md, "Embedded games"](AUTH.md#embedded-games-gamesslug)                  |
| Account-changes feed, account ids                | [AUTH.md, "Embedded games"](AUTH.md#embedded-games-gamesslug)                  |
| The chat inside a game, its room, postMessage    | [EMBED.md](EMBED.md#the-embedded-games-rooms), [snippet](EMBED.md#the-snippet) |
| Installing: questions, routes folder, token      | [DEPLOYMENT.md, "Embedded games"](DEPLOYMENT.md#embedded-games)                |
| Optional open sign-ups listing                   | [OPEN-ROUNDS.md](OPEN-ROUNDS.md)                                               |
| Optional: the season in play, the halving days   | [Section 6, "Season feed"](#season-feed) below                                 |
| Optional: a member's results on their profile    | [Section 7](#7-a-members-results-on-their-profile) below                       |
| Required: a way back to the website              | [Section 8](#8-a-way-back-to-the-website) below                                |
| Decided, not built: a call view beside the game  | [Section 9](#9-call-view-inside-a-game) below                                  |

## 1. Architecture and deployment profile

The current profile is for **trusted games operated with the website on the same origin**:
the embedded games are the owner's own, on the same server (decided 2026-11-09).

```text
Browser -> website nginx / Caddy
             /, /api/*, /embed/chat, /ws/chat -> website server
             /games/bingo/*                  -> Bingo server
             /games/mini-games/*             -> Mini Games server
             /games/race/*                   -> race server (its own repository)
             /games/cases/*                  -> Cases server (its own repository)
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
`X-Sbr-Proxy-Secret`, Mini Games `X-Smg-Proxy-Secret`, Cases `X-Sc-Proxy-Secret`. The proxy overwrites or clears the
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
   (`server/src/games/embedded.js`: `bingo`, `mini-games`, `race`, `cases`); the installer's question switches a
   game on (`GAMES_EMBEDDED`). A new game also needs its entry in `deploy/install/lib/games.sh`
   and its feed denied in `deploy/site/Caddyfile`, with docs and tests; an environment value or
   a game card alone is not enough. Every file and step for a new game, in this repository and
   by hand: [ADDING-A-GAME.md](ADDING-A-GAME.md).
2. **Install the game.** Its installer writes its own route file into the website's prepared
   routes folder (nginx `/etc/seasonal/routes/*.conf`, or `/etc/caddy/routes/*.caddy`), keeps
   files holding secrets 0600, validates the proxy configuration before a reload and restores
   the previous route if the check fails. It never changes website-owned files.
3. **Create the catalogue card** in Admin → Games (path `/games/<slug>`, no trailing slash).
   Card visibility and maintenance status are presentation, not route authorization.

Optional: the [open-rounds contract](OPEN-ROUNDS.md), its HTTPS status URL in the card's
"Sign-up status URL". Current: Bingo provides `/games/bingo/api/public/open-rounds`, and Cases
`/games/cases/api/public/open-rounds` (version 1); Mini Games does not expose it.

### Season feed

Built (decided 2026-11-21): the site publishes the token in season and the halving days, so a
game need not compute the season itself. `GET https://<site domain>/api/public/season`: public,
no login, JSON, `Cache-Control: public, max-age=60` (`server/src/season/routes.js`). Every value
comes from the site's season clock (`shared/seasonClock.js`), the one the home banner shows.

```jsonc
{
  "v": 1,
  "inSeason": { "season": "autumn", "token": "AUTUMN", "since": "2026-03-05T22:32:17Z" },
  "halvingDays": [{ "day": "2026-12-04", "token": "AUTUMN" }],
}
```

- `inSeason.season` is the token with the highest current reward in lower case (`spring`,
  `summer`, `autumn`, `winter`); `token` is the same in upper case.
- `since` (ISO 8601, UTC) is the halving that made it the leader: the most recent halving that
  changed which token pays most.
- `halvingDays` lists every halving from 30 days ago to two years ahead, oldest first, as UTC
  dates with the token that halves.
- A new field may be added within version 1; a game ignores fields it does not know. A changed
  meaning gets `v: 2`.

The shape is the one Mini Games proposed (its `docs/spec/07-integration.md`, §5). A game on
this site reads it server to server, never from a season passed in by the embedding page.

## 7. A member's results on their profile

**Built on `night/2026-11-14`, not merged yet** (decided 2026-11-14). **Optional for a game**:
until a game answers, its card simply does not show. The website asks; the game answers.

On a member's profile (`/members/<name>`, signed-in members only) the website shows one card
per embedded game: up to four values the game names itself (label and value, for example
"Played 12", "Wins 3", "Best place 2"), "Last played <date>" and a link into the game
(`/games/<slug>`). The member can hide their cards with "Show my game results" on the account
page (on by default); while it is off, the games are not asked at all.

**The request** (server to server, never through the public web server):

```text
GET <local origin>/games/<slug>/api/website/member-summary?user=<website user id>
X-Games-Sync-Token: <the games' sync token>
Accept: application/json
```

- `<local origin>`: the game server's own address, set on the website per game in
  `GAMES_LOCAL_ORIGINS` (`site.env`, a comma list such as `bingo=http://host.docker.internal:4310`;
  only known slugs and plain `http(s)://host:port` origins). A game without an entry is not
  asked. The site runs in its container, where `127.0.0.1` is the container itself: the
  address must be one the container reaches (for example the host through
  `host.docker.internal`, which the site service would need as an `extra_hosts` entry, and a
  game port open to the container's network). **Not wired by the installer yet**: neither that
  entry nor a question for the origins (needs the owner's word, docs/reports/2026-11-14-night.md).
- `X-Games-Sync-Token`: the same token the game already uses for the account-changes feed
  (one for all games, `/etc/seasonal/games-sync-token`), so no new secret. Required: compare
  it in constant time and answer `401` without it. Required: do **not** expose this route
  through the public proxy route; only the website reaches it.
- `user`: the website user id, the second half of the game's account key
  ([section 3](#3-account-mapping-rights-and-sessions)).

**The answer** (`200`, `application/json`, at most **4096 bytes**):

```json
{
  "values": [
    { "label": "Played", "value": 12 },
    { "label": "Wins", "value": 3 },
    { "label": "Best place", "value": "2nd" }
  ],
  "lastPlayedAt": "2026-11-13T19:00:00Z"
}
```

- `values`: **1 to 4** items, shown in this order. `label`: text of 1 to **24** characters;
  `value`: a whole number from 0 to 999 999 999, or text of 1 to **16** characters. Texts are
  trimmed; control characters are refused. Both are shown as plain text, never as markup.
- `lastPlayedAt`: an ISO 8601 time, or `null` / absent. Shown as a date in the viewer's zone.
- **No data**: `{"noData": true}`, or `404` for a player the game does not know. No card.
- Anything else (another status, a redirect, more than 4096 bytes, broken JSON, more than four
  values, a longer text, more than **1.5 seconds**) leaves that game's card out. The website
  never shows an error for it and never lets a game hold up the profile: the cards load in a
  request of their own (`GET /api/members/<name>/games`).
- **Cache**: the website keeps an answer (a card or "no data") **5 minutes** per member and
  game, and a failure **1 minute**. A game sees at most one request per member and 5 minutes
  from profile views.

Website side: `server/src/games/memberSummary.js` (the contract check, the request, the cache),
the route in `server/src/profiles/routes.js`, the cards `client/src/profiles/GameResults.jsx`.
Tests: `server/test/gameResults.test.js` with the stand-in game `server/test/helpers/fakeGame.js`
(a small local server answering this contract), `client/src/profiles/gameResults.test.jsx`.

## 8. A way back to the website

**Required** for every embedded game (decided 2026-11-17). **Not yet implemented in any
game.**

- In website mode, every screen of the game shows a small link **"← Seasonal Entertainment"**
  at the top left. It leads to the website's games page, **`/games`** (the website's route
  `games` in `client/src/app/App.jsx`, the page `client/src/pages/GamesPage.jsx`). The game
  runs under `/games/<slug>/` on the website's own origin, so the link is the root-relative
  `/games`. Same tab, plain navigation (an ordinary link), no popup and no new window.
- It stays small, so it takes no play area. It uses the game's own styling and works in light
  and dark mode and at phone width.
- In standalone mode (no website) the link is not shown.
- If a game screen has no room at the top left, the game does not move the link elsewhere on
  its own: it reports that screen to the owner, who decides.

Current: Bingo, Mini Games and the race do not show the link yet (2026-11-17).

## 9. Call view inside a game

**Decided 2026-11-20. Not built on the site yet**: the site has no `/embed/call/<id>` page, and
`/calls/<id>` cannot be framed (`frame-ancestors 'none'`, `server/src/http/securityHeaders.js`).
This section is the contract games build against once the page exists. The questions behind
each point, the reasons and the file references are in
[the answers report](../reports/call-embed-answers-2026-11-20.md).

- **The page**: the site serves a reduced call page, `/embed/call/<id>?theme=<light|dark|auto>`,
  framed like the chat. A game never connects to the call service (LiveKit) itself and never
  gets a call token of its own; the site stays the only authority in a call
  ([CALLS.md](CALLS.md#architecture)).
- **Listen only**: the view shows the call's sound, the spotlight speaker or the speakers, the
  red "Recording" mark with the consent question before joining a recorded call, **Leave**, and
  a link "Open the call page" to `/calls/<id>`. Raising a hand, the stage, microphone, camera,
  screen share, the organisers' controls, polls, the listener list and the call's chat stay on
  `/calls/<id>`.
- **Which call**: the game's host (who holds `Can-Host` for this game,
  [section 3](#3-account-mapping-rights-and-sessions)) links a round or lobby to a call by the
  site's numeric call id, entered as the id or as the address `/calls/<id>` (Bingo's
  `host_call_ref`). The game's server enforces who may link. The game checks the id with the
  public `GET /api/calls/<id>` and accepts only a scheduled or live call. When the call ends or
  is deleted, the frame posts `ended` (`reason`: `ended`, or `gone` for a deleted one); the game
  collapses or hides the slot and never ends its round because of the call.
- **Placement and sizes** (CSS px; they follow the games' layout, decided 2026-11-20):

  | Where                             | Slot                                            |
  | --------------------------------- | ----------------------------------------------- |
  | Desktop, normal window            | 338 × 190: the docked chat strip's height, 16:9 |
  | Desktop, window under 760 px high | 267 × 150: the low strip, 16:9; the smallest    |
  | Desktop, collapsed                | 48 × the strip's height: the audio-only form    |
  | Phone portrait                    | full width × 48: the audio strip                |
  - **Desktop: bottom right.** The view is its own box at the right end of the game's docked
    chat strip, at the strip's full height; the chat sits beside it on the left. The 190 and
    150 px are Seasonal Mini Games' strip, the reference layout.
  - **No control bar below the picture.** The controls sit over the 16:9 picture, letterboxed as
    on the call page:
    - top left: the Recording mark;
    - top right: Open the call page and Collapse;
    - in the middle before listening: **Listen**;
    - bottom right while listening: Mute and Leave;
    - all of them 44 px.
  - **Smaller than 267 × 150** the view shows only its collapsed form: a 48 px column with the
    LIVE and recording marks, Listen or Mute (with a ring while someone talks) and Expand.
  - **Phone:** the 48 px strip sits directly above the game's chat bar, in the layout, never over
    the content. It holds the LIVE and recording marks, the speaker's name, Listen or Mute, and
    Expand. Expand opens the picture (full width × width × 9/16) where the chat sheet opens.

  The report's question 4 has the measurements behind each number.

- **Sign-in**: the site's cookie session, exactly as the chat's
  ([section 5](#5-the-website-chat-inside-a-game)); guests listen as on the site. No embed
  token: the 12-hour token of approved other sites stays refused for calls
  ([EMBED.md](EMBED.md#on-an-approved-other-site)).
- **Framing**: only by the site's own pages, the games under `/games/<slug>/`; not by the
  chat's approved other sites. The game page keeps `frame-src 'self'`, sets no
  `Permissions-Policy` of its own that turns off `autoplay` or `fullscreen`, and frames the
  view with `<iframe allow="autoplay; fullscreen">`; no `microphone`, `camera` or
  `display-capture`.
- **postMessage**: `source: 'seasonal-call'` from the view, `'seasonal-call-host'` to it,
  checked as the chat's are ([EMBED.md](EMBED.md#the-postmessage-api): origin, window and
  `source`; never `'*'`). Nothing secret goes to the game: no token, no identities, no names.

  | From the view | Fields                                                         | When                                                                         |
  | ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
  | `ready`       | `call` (id), `status` (`scheduled`/`live`/`ended`), `signedIn` | once the call is known; again when one changes                               |
  | `live`        | `listening` (bool)                                             | the call went live; the visitor started or stopped listening                 |
  | `ended`       | `reason` (`ended`/`gone`)                                      | ended on the site, or deleted / not found                                    |
  | `speaking`    | `active` (bool)                                                | someone on the stage talks / silence                                         |
  | `resize`      | `mode` (`picture`/`collapsed`), `width`, `height` (px)         | the view asks for its other form (16:9 at the strip's height, or 48 px wide) |
  | `error`       | `code` (e.g. `call_full`, `banned`, `recording_consent`)       | joining failed; the view shows the text                                      |

  | To the view | Fields                            | Effect                                               |
  | ----------- | --------------------------------- | ---------------------------------------------------- |
  | `mute`      | `muted` (bool)                    | silences the view's sound locally; stays joined      |
  | `collapse`  | `collapsed` (bool)                | the picture or the collapsed form (phone: the strip) |
  | `theme`     | `theme` (`light`, `dark`, `auto`) | as the chat's `theme`                                |
  | `visible`   | `visible` (bool)                  | out of sight: the view stops receiving video         |

- **Sound**: the view has its own **Listen** button, in the middle of the picture (in the
  collapsed form and the phone strip, the 44 px Listen button, which becomes Mute). It connects
  only on that click inside the frame: browsers start sound only after a click, and a click in the game page does not count
  for the frame. The game's own sound plays on beside it; the game may turn itself down while
  `speaking` is true. The view's mute button and the host's `mute` silence only the call's
  sound; the game's controls silence only the game; nothing in a game touches a speaker's
  microphone.
- **Phone and focus mode**: on a phone the view opens as the 48 px audio strip, the picture on
  tap. In the game's focus mode it shows its collapsed form (the 48 px column on a desktop, the
  strip on a phone) or is hidden with `visible: false`; its sound keeps playing until the
  visitor stops it. No picture-in-picture.
- **Season colours**: `client/src/styles/tokens.css` stays the single source
  ([DESIGN.md, "Tokens"](DESIGN.md#tokens)): Spring `#AFB84E`, Summer `#E06E22`, Autumn
  `#F9A825`, Winter `#04AAF7`, and `#14171C` for text on them (`--color-on-season`). The games'
  shared UI kit keeps a copy of these five values; its CI compares the copy with `tokens.css`
  on the site's `master` and fails on a difference.

**What a game may do today**: reserve the slot of the sizes above (bottom right in the chat
strip on a desktop, the strip above the chat bar on a phone), **hidden while no call is
linked**, and a call-id field for the host in a round or lobby, checked with
`GET /api/calls/<id>`. Frame nothing in the slot until this section says the page is built.

## 10. Other profiles and proposals

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

## 11. Copyable task brief for a game repository

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
protection and catalogue setup. Optionally implement docs/OPEN-ROUNDS.md and the member
summary of docs/GAME-INTEGRATION.md section 7 (local only, the sync token), and the season
feed of section 6 (/api/public/season). Do not assume OIDC, a website JWT issuer or per-match
website chat rooms. Reserve the call view
of section 9 only as a hidden slot until the website has built it.
Use the acceptance checklist below; report remaining gaps explicitly.
```

## 12. Acceptance checklist

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
- [ ] In website mode every screen shows "← Seasonal Entertainment" at the top left, leading to
      `/games` in the same tab; small, in light and dark mode and at phone width; not shown
      standalone; a screen without room reported to the owner (section 8).
- [ ] Optional call view (section 9): until the website builds `/embed/call/<id>`, only the
      hidden slot and the host's call-id field; afterwards, the contract of section 9.
- [ ] Optional member summary: only with the sync token, not reachable through the public
      route, within the limits of section 7, `noData` or `404` for an unknown player.

## 13. Source map and maintenance

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
- The games page the way back leads to: `client/src/pages/GamesPage.jsx`, route `games` in
  `client/src/app/App.jsx`
- The call view (decided, not built): the call page's parts in `client/src/calls/`, framing in
  `server/src/http/securityHeaders.js`; details in `reports/call-embed-answers-2026-11-20.md`
- A member's results: `server/src/games/memberSummary.js`, `GAMES_LOCAL_ORIGINS` in
  `embedded.js`, the route in `server/src/profiles/routes.js`
- Website tests: `server/test/embeddedGames.test.js`, `embeddedFeed.test.js`,
  `gameHosts.test.js`, `gameRooms.test.js`, `openRounds.test.js`, `gameResults.test.js`; chat
  browser cases in
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
