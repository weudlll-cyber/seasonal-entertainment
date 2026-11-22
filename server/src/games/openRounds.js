// ============================================================
// File:        openRounds.js
// Path:        server/src/games/openRounds.js
// Project:     Seasonal Entertainment
// Description: Games' open sign-ups (docs/OPEN-ROUNDS.md; decided 2026-11-04): every minute,
//              and at once after an admin saves a game, each game with a sign-up status URL is
//              read through the link previews' guarded fetch (the chat handle's images.download,
//              previews/safeFetch.js: https on
//              443, public addresses only, no redirects at all here, 5 s, at most 64 KB) and
//              checked against the contract (openRoundsContract.js). The last good answer of a
//              game counts for 3 minutes; after that, or with none, the game has no open rounds.
//              A game that starts or stops failing is logged once per change, with the reason
//              only, never the body. roundsFor() is what the games listing shows (routes.js).
//              A switched-on embedded game whose card has no URL entered is read at
//              <PUBLIC_ORIGIN>/games/<slug>/api/public/open-rounds, the card matched to its slug
//              by its path /games/<slug> (decided 2026-11-21); an entered URL still wins.
// ============================================================

import { gameStatusSources } from './store.js';
import { StatusInvalid, parseOpenRounds } from './openRoundsContract.js';

export const POLL_MS = 60_000;
export const STALE_MS = 3 * 60_000;
const FETCH = {
  accept: ['application/json'],
  maxBytes: 64 * 1024,
  // A redirect could lead anywhere: the contract's page answers itself or not at all.
  maxRedirects: 0,
  timeoutMs: 5000,
  userAgent: 'SeasonalEntertainmentGames/1.0 (open sign-ups for the Seasonal Entertainment site)',
};

// The URL a game's sign-ups are read from, or null: the one an admin entered, else for a
// switched-on embedded game (embedded: its slugs) the path every embedded game serves under the
// site's own https origin. Without a public https origin (development) nothing is derived.
export function statusUrlOf({ path, statusUrl }, { siteOrigin, embedded }) {
  if (statusUrl) return statusUrl;
  const slug = /^\/games\/([a-z0-9-]+)$/.exec(path ?? '')?.[1];
  if (!slug || !embedded.includes(slug) || !siteOrigin?.startsWith('https://')) return null;
  return `${siteOrigin}/games/${slug}/api/public/open-rounds`;
}

// download: the chat handle's guarded fetch (chat.images.download: previews/safeFetch.js, the
// one way the server reaches the internet; { ok, status, body } or { ok: false, reason });
// network: its network (undefined: the real internet; tests and development hand in their own);
// log: one line per change; siteOrigin: PUBLIC_ORIGIN; embedded: the switched-on slugs
// (GAMES_EMBEDDED), for the derived URLs (statusUrlOf).
export function createOpenRounds(
  db,
  { download, network, log = console.warn, siteOrigin = null, embedded = [] }
) {
  const urlOf = (game) => statusUrlOf(game, { siteOrigin, embedded });
  // game id -> { rounds, at: when they were read, failing: the reason, or null }
  const state = new Map();

  async function readGame({ id, statusUrl }, now = Date.now()) {
    const known = state.get(id) ?? { rounds: [], at: 0, failing: null };
    // Whatever goes wrong (refused, not the contract, a name that does not resolve) is this
    // game's failure alone: the other games are still read.
    let failing = null;
    const res = await download(statusUrl, FETCH, network);
    if (!res.ok) failing = res.reason;
    else if (res.status !== 200) failing = `status ${res.status}`;
    else {
      try {
        const rounds = parseOpenRounds(res.body.toString('utf8'), statusUrl, now);
        state.set(id, { rounds, at: now, failing });
      } catch (err) {
        if (!(err instanceof StatusInvalid)) throw err;
        failing = err.message;
      }
    }
    if (failing) state.set(id, { ...known, failing });
    // Once per change of state (failing or answering), not when only the reason changes.
    if (Boolean(failing) !== Boolean(known.failing)) {
      log(
        failing
          ? `[games] the sign-up status of game ${id} failed: ${failing}`
          : `[games] the sign-up status of game ${id} answers again`
      );
    }
  }

  // Every game with a status URL, entered or derived, one after another (a handful at most). A
  // game that no longer has one is forgotten.
  async function pollAll() {
    const games = gameStatusSources(db)
      .map((game) => ({ id: game.id, statusUrl: urlOf(game) }))
      .filter((game) => game.statusUrl);
    const ids = new Set(games.map((g) => g.id));
    for (const id of state.keys()) if (!ids.has(id)) state.delete(id);
    for (const game of games) await readGame(game);
  }

  let timer = null;
  return {
    pollAll,
    // After an admin saved a game: its sign-ups at once (none any more without a URL).
    async refresh(game) {
      const statusUrl = urlOf(game);
      if (!statusUrl) return void state.delete(game.id);
      await readGame({ id: game.id, statusUrl });
    },
    // The open rounds shown for a game now: the last good answer while it is fresh.
    roundsFor(gameId, now = Date.now()) {
      const known = state.get(gameId);
      return known && now - known.at <= STALE_MS ? known.rounds : [];
    },
    start() {
      pollAll().catch((err) => log(`[games] reading sign-ups failed: ${err.message}`));
      timer = setInterval(
        () => pollAll().catch((err) => log(`[games] reading sign-ups failed: ${err.message}`)),
        POLL_MS
      );
      timer.unref();
    },
    stop() {
      clearInterval(timer);
    },
  };
}
