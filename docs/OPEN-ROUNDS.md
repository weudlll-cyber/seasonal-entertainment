# Open sign-ups of games

Games tell this site which of their rounds are open for sign-up, and the site shows them on the
home page's "Featured game" box and on the games page. The game decides what is listed; the site
shows what the game lists. The bingo repository holds the same contract (decided 2026-11-04).

## Decisions (2026-11-04)

- The home page's "Featured game" box shows games in rotation: games with an open sign-up first,
  then the others; each game 8 seconds; it also rotates when no game has an open sign-up.
- The games page shows on every card whether a sign-up is open.
- Everyone sees the sign-up hints, signed in or not.
- Only rounds the game's host marked "show on the website" appear (the game filters; the site
  shows what the game lists).

## The shared contract

```text
  GET <status URL>  — public, no login, JSON, Cache-Control max-age=30
  {
    "version": 1,
    "rounds": [
      {
        "id": "string, stable per round, max 64 chars",
        "title": "string, max 80 chars",
        "kind": "string, max 40 chars (e.g. 'Seasonal Bingo Royale')",
        "startsAt": "ISO 8601 UTC or null",
        "signupClosesAt": "ISO 8601 UTC or null",
        "players": integer >= 0,
        "maxPlayers": integer >= 1 or null,
        "joinUrl": "absolute https URL on the same origin as the status URL"
      }
    ]
  }
  At most 20 rounds; only rounds whose sign-up is open now and that the host marked for the website; no personal data (no player names). Unknown fields are ignored; a higher "version" is ignored as a whole until supported.
```

## How this site reads it

- **Where**: Admin → Games, the optional field "Sign-up status URL" per game (https only, at most
  300 characters, no credentials in it; audited like the other game fields, docs/SETTINGS.md). It
  never leaves the admin pages: the public games listing does not carry it.
- **When**: every 60 seconds for every game with a status URL (every game is visible to someone;
  the rounds travel only with the cards a viewer may see), and at once after an admin saves a game
  (`server/src/games/openRounds.js`; on while the server's background jobs are).
- **How**: through the link previews' guarded fetch (`server/src/previews/safeFetch.js`: https on
  port 443 only, public addresses only, no redirects at all, 5 seconds, at most 64 KB, JSON only).
- **Checked strictly** (`server/src/games/openRoundsContract.js`): an answer that is not the
  contract's page (not JSON, no `version`, no `rounds` array) is a failure; a page of a higher
  `version` counts as no rounds; each round that breaks a rule is dropped on its own, never the
  page: a text too long or empty, a time that is not ISO 8601 in UTC (`…Z`), a count out of range,
  a `joinUrl` that is not https or not on the status URL's origin, a sign-up that has closed by
  now. Only the first 20 entries are read. Unknown fields are never passed on.
- **Kept**: the last good answer of a game counts for 3 minutes; after that, or without one, the
  game has no open rounds. A game whose answers start or stop failing is logged once per change,
  with the reason only, never the body.
- **Shown**: `GET /api/games` (public) gives each card `openRounds`, sorted by `startsAt` (none
  last), then title. The home page reads the same answer.
- **Tests**: `server/test/openRounds.test.js` (a pretend internet: valid, invalid fields, too
  large, too slow, not the contract, a redirect, a foreign joinUrl, a host that does not
  resolve failing for its own game alone, stale after 3 minutes, the log, the API and the admin
  field) and `client/e2e/openRounds.spec.js` (a real browser: the fake host below, the box
  leading with the open sign-up and moving on after 8 seconds, the games page's badge).

## Trying it locally

Outside production the server answers the reserved host `status.games.test` itself (".test"
never resolves on the real internet; `server/src/games/statusFixture.js`, the technique of the
fake event bot's images): every path there answers the file `game-status-fixture.json` beside the
database, read anew on each request, and every other host goes to the real internet through the
same guard. `npm run dev:game-status -- on` adds a test game "Open rounds test" with the
status URL `https://status.games.test/open-rounds` and writes a fixture with two open rounds;
`off` removes both (it never touches other games). The site reads it within a minute (at once
after a restart). Its "Join" links point at `status.games.test`, which no browser can open.
