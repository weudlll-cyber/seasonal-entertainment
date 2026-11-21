# Adding a game

What this site needs so that one more game can run inside it at `/games/<slug>/` (decided
2026-11-21). It describes the site's side, file by file. The game's own side, its contracts and
its acceptance checklist are in [GAME-INTEGRATION.md](GAME-INTEGRATION.md). Worked examples:
the race (commit `6d5c25f`, 2026-11-11) and Cases (`feat/cases-slug`, 2026-11-21).

## 1. What the game provides

Agree these with the game's project before anything changes here.

| Item                        | What                                                                                             | Example (Cases)                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Slug                        | lower case, digits and single hyphens (`GAME_PATH_PATTERN`, `shared/gameRules.js`)               | `cases`                                          |
| Name                        | shown in Admin → Users ("May host <name>") and the installer's question                          | "Seasonal Cases"                                 |
| Room name                   | the name of its chat room, whose slug is the game's                                              | "Seasonal Cases"                                 |
| Base path                   | `/games/<slug>/`; every asset, API, WebSocket, redirect and cookie under it                      | `/games/cases/`                                  |
| Sign-in route and login hop | `/games/<slug>/auth/website` and `/games/<slug>/auth/website/login` (GAME-INTEGRATION §2)        | `/games/cases/auth/website`                      |
| Proxy secret header         | its own, listed in GAME-INTEGRATION §2 ("Current secret headers")                                | `X-Sc-Proxy-Secret`                              |
| Account-changes feed        | it reads `/api/games/<slug>/account-changes` with the sync token (GAME-INTEGRATION §4)           | as AUTH.md                                       |
| Deleted accounts, renames   | a deleted account becomes "Deleted player", a rename shows from the next sign-in (AUTH.md)       | as every game                                    |
| Open rounds (optional)      | a status URL by [OPEN-ROUNDS.md](OPEN-ROUNDS.md); the admin field takes `https://` only          | `/games/cases/api/public/open-rounds`, version 1 |
| Member summary (optional)   | a member's results for the profile (GAME-INTEGRATION §7)                                         | not yet                                          |
| Way back (required)         | "← Seasonal Entertainment" to `/games` on every screen (GAME-INTEGRATION §8)                     | as every game                                    |
| Call view slot              | only the hidden slot and the host's call-id field until the site builds it (GAME-INTEGRATION §9) | as every game                                    |
| Its own installer           | writes its route file into the routes folder this site prepares (section 4 below)                | not yet                                          |

## 2. What changes in this repository

One change, with docs and tests in the same commit. Nothing else in the code names the games:
the routes, the "May host" boxes, the hosting grants and the games list all follow from the
allowlist.

**Server**

- `server/src/games/embedded.js`: one entry in `EMBEDDED_GAMES`,
  `<slug>: { name, roomName }`, in the order the games came. The header comment lists the
  games and the date of each decision.
- `server/src/games/embeddedRoutes.js` and `server/src/app.js`: only their header comments,
  which name the games and the dates.
- `server/src/chat/seed.js`: no code. `ensureGameRooms` adds the game's room (its slug, the room
  name, guests read, members write) on the next start while the game is in `GAMES_EMBEDDED`.
  Only its header comment names the games. The race was the exception: its room already existed
  as a first-start room, so it got a one-time slug rename in `server/src/chat/schema.js`.
  A new game does not need one.

**Installer and proxies**

- `deploy/install/lib/games.sh`: one line in `EMBEDDED_GAMES`, `"<slug> <KEY> <Name>"` (KEY is
  the slug in upper case with `_` for `-`). The question, the remembered answer and the nginx
  feed denial (`location ~* ^/api/games/<slug>/account-changes`, any letter case) all follow
  from it. The header comment names the games.
- `deploy/install.sh`: `<KEY>` in `ANSWER_KEYS`, the usage line `--<slug>`, `ASK_<KEY>=no`, the
  case `--<slug>) ASK_<KEY>=yes ;;`, the two checks (with an install or `--update`, not with
  `--yes`), and the `--update` list in its message. `deploy/test/games.test.sh` checks the
  usage line, the case and the default for every game of `games.sh`.
- `deploy/install/lib/update.sh`: `[[ "${ASK_<KEY>:-no}" == no ]] || args+=(--<slug>)`, so
  `--update` passes the flag on; its header comment.
- `deploy/install/lib/common.sh`: `<KEY>` in `STATE_KEYS` and in the comment above it.
- `deploy/install/answers.example`: `<KEY>=` and the comment above the games.
- `deploy/site/Caddyfile`: `/api/games/<slug>/account-changes*` in the `@gameFeeds` matcher
  (own-Caddy mode answers 404).
- `.env.example`: the slug in the `GAMES_EMBEDDED` comment.

**Tests that enumerate the games**

- `server/test/embeddedGames.test.js`: the list read from `GAMES_EMBEDDED`, and `GAMES` in full.
- `server/test/gameRooms.test.js`: the room's name in `NAMES`. The loops over `GAMES` then cover
  the room, its rules and the framed chat.
- `server/test/adminUsers.test.js`: the games list `GET /api/admin/users` answers.
- `server/test/gameHosts.test.js`: the old "may start games" flag becomes a grant for every
  game. It reads `EMBEDDED_GAMES` itself, so it needs no new line, but it compares in slug
  order (it went red for Cases until it sorted).
- `server/test/discordLogin.test.js`: the return to the game's sign-in route after Discord.
- `client/src/admin/adminPages.test.jsx`: one "May host <name>" box per game.
- `client/src/pages/loginNext.test.jsx` and `client/src/session/nextPage.test.js`: the way back
  to `/games/<slug>/` after the login.
- `deploy/test/games.test.sh`: the question (its text in `<KEY>_Q`), its flag, the answers
  file, the state, `--update`'s pass-through, `site.env`, and the feed denied by the real nginx
  and Caddy (in Docker, always in CI).
- The race also changed `client/src/embed/embedChat.test.jsx`, `client/e2e/accounts.spec.js`
  and several chat tests, but only for its room's rename. A new game does not touch them.

**Docs that list the games**

- [ARCHITECTURE.md](ARCHITECTURE.md): the `GAMES_EMBEDDED` row, the games paragraph and
  `src/games/` in the layout.
- [AUTH.md](AUTH.md), "Embedded games": the table (game, slug, path, room, date), the dates of
  the decisions, the installer flags and the list of `<slug>` values.
- [CHAT.md](CHAT.md): the games' rooms. [EMBED.md](EMBED.md): the rooms table (slug, name,
  `/embed/chat?room=<slug>&theme=auto`) and the date.
- [GAME-INTEGRATION.md](GAME-INTEGRATION.md):
  - a status paragraph at the top;
  - the route diagram (§1);
  - the secret header (§2);
  - the slug list and the open-rounds "Current" sentence (§6).
- [DEPLOYMENT.md](DEPLOYMENT.md), "Embedded games": the summary row, the paragraph, the question
  table, the flags and answer keys, and the feed paths.
- [BACKLOG.md](BACKLOG.md): the closed entry in part two, and in part one what still waits for the
  game.

## 3. What an admin does by hand afterwards

- **Switch it on**: the installer's question (or `--<slug>` later) puts the slug in
  `GAMES_EMBEDDED` in `site.env`. Its room appears on the next start (EMBED.md, "The embedded
  games' rooms"). In development, set `GAMES_EMBEDDED` for the run (for example
  `GAMES_EMBEDDED=cases npm run dev`); the dev setup has no default for it.
- **The game card**, Admin → Games (`/admin/games`):
  - the path `/games/<slug>` without a trailing slash;
  - the status (`coming_soon` until the game is live);
  - who may see it;
  - an image from the fixed list `GAME_IMAGES` in `shared/gameRules.js`: `seasonal-tokens`,
    `spring`, `summer`, `autumn` or `winter`;
  - optionally the "Sign-up status URL", `https://` only (`server/src/games/adminRoutes.js`),
    for example `https://<site domain>/games/cases/api/public/open-rounds`.

  The card is presentation only; the routes follow `GAMES_EMBEDDED`.

- **Who may host**, Admin → Users: one "May host <name>" box per member and game (audited
  `user.game_host`). Admins always may.
- **The chat embed**: a game under `/games/<slug>/` on this site's own domain needs no entry
  (`frame-ancestors 'self'`). Only a game on another origin, or a local one for a test, goes on
  Admin → Embedding (EMBED.md, "Approving a site").

## 4. What the game's own installer does on the server

From DEPLOYMENT.md, "Embedded games"; this site's installer only prepares the server.

- **nginx mode:** it writes its route file, a `*.conf`, into `/etc/seasonal/routes/`, mode 600,
  because the file holds the proxy secret. It validates with `nginx -t` before the reload
  and restores the previous file if the check fails. This site's server block includes that
  folder once and denies every game's feed. The game reads its feed over the site's local port,
  `http://127.0.0.1:<port>`, with the port in `/etc/seasonal/site-local-port`.
- **Own-Caddy mode:** it writes its `*.caddy` file into `/etc/caddy/routes/` (in the repository,
  `deploy/site/routes/`). The feed is reached only from the site's Docker network, at
  `http://site:3800`.
- **The sync token:** it reads `/etc/seasonal/games-sync-token` (root, 600) and sends it as
  `X-Games-Sync-Token`. There is one token for all games.
- **It never edits this site's files.** Its route file strips the website's cookies before
  forwarding (GAME-INTEGRATION §3).
- **`GAMES_LOCAL_ORIGINS`** in `site.env`, for example
  `cases=http://host.docker.internal:<port>`: the address at which this site's server reaches
  the game. It is used only to ask for a member's results (GAME-INTEGRATION §7). This site's
  installer does not set it yet (BACKLOG.md, "Game results need each game's address").

## 5. Checklist

- [ ] Slug, name, room name, secret header and paths agreed with the game's project
- [ ] `server/src/games/embedded.js` entry; header comments of `embedded.js`, `embeddedRoutes.js`,
      `app.js`, `chat/seed.js`
- [ ] `deploy/install/lib/games.sh` line; `install.sh`, `update.sh`, `common.sh`,
      `answers.example`
- [ ] `deploy/site/Caddyfile` feed matcher; `.env.example`
- [ ] The tests of section 2 extended; each broken once on purpose and seen red
- [ ] `deploy/test/games.test.sh` green, with Docker
- [ ] ARCHITECTURE, AUTH, CHAT, EMBED, GAME-INTEGRATION, DEPLOYMENT, BACKLOG updated
- [ ] `npm run verify` green; the pull request's checks green
- [ ] After the merge: `<KEY>=yes` (or `--<slug>`), the room seen after the start
- [ ] Admin → Games card; Admin → Users "May host" boxes; Admin → Embedding only for another
      origin
- [ ] The game's installer writes its route file; its sign-in works through the real proxy
- [ ] Optional: the sign-up status URL; `GAMES_LOCAL_ORIGINS` once the game offers its member
      summary
