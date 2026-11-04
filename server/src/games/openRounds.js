// ============================================================
// File:        openRounds.js
// Path:        server/src/games/openRounds.js
// Project:     Seasonal Entertainment
// Description: Games' open sign-ups (docs/OPEN-ROUNDS.md; decided 2026-11-04): every minute,
//              and at once after an admin saves a game, each game with a sign-up status URL is
//              read through the link previews' guarded fetch (previews/safeFetch.js: https on
//              443, public addresses only, no redirects at all here, 5 s, at most 64 KB) and
//              checked against the contract (openRoundsContract.js). The last good answer of a
//              game counts for 3 minutes; after that, or with none, the game has no open rounds.
//              A game that starts or stops failing is logged once per change, with the reason
//              only, never the body. roundsFor() is what the games listing shows (routes.js).
// ============================================================

import { FetchRefused, realNetwork, safeFetch } from '../previews/safeFetch.js';
import { gamesWithStatusUrl } from './store.js';
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

// network: safeFetch's (tests and development hand in their own); log: one line per change.
export function createOpenRounds(db, { network = realNetwork, log = console.warn } = {}) {
  // game id -> { rounds, at: when they were read, failing: the reason, or null }
  const state = new Map();

  async function readGame({ id, statusUrl }, now = Date.now()) {
    const known = state.get(id) ?? { rounds: [], at: 0, failing: null };
    let failing = null;
    try {
      const res = await safeFetch(statusUrl, FETCH, network);
      if (res.status !== 200) throw new FetchRefused(`status ${res.status}`);
      state.set(id, {
        rounds: parseOpenRounds(res.body.toString('utf8'), statusUrl, now),
        at: now,
        failing,
      });
    } catch (err) {
      // Whatever went wrong (refused, not the contract, a name that does not resolve) is this
      // game's failure alone: the other games are still read.
      failing =
        err instanceof FetchRefused || err instanceof StatusInvalid ? err.message : 'unreachable';
      state.set(id, { ...known, failing });
    }
    // Once per change of state (failing or answering), not when only the reason changes.
    if (Boolean(failing) !== Boolean(known.failing)) {
      log(
        failing
          ? `[games] the sign-up status of game ${id} failed: ${failing}`
          : `[games] the sign-up status of game ${id} answers again`
      );
    }
  }

  // Every game with a status URL, one after another (a handful at most). A game whose URL was
  // removed is forgotten.
  async function pollAll() {
    const games = gamesWithStatusUrl(db);
    const ids = new Set(games.map((g) => g.id));
    for (const id of state.keys()) if (!ids.has(id)) state.delete(id);
    for (const game of games) await readGame(game);
  }

  let timer = null;
  return {
    pollAll,
    // After an admin saved a game: its sign-ups at once (none any more without a URL).
    async refresh(game) {
      if (!game.statusUrl) return void state.delete(game.id);
      await readGame(game);
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
