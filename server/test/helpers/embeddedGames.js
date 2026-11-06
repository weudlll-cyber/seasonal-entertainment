// ============================================================
// File:        embeddedGames.js
// Path:        server/test/helpers/embeddedGames.js
// Project:     Seasonal Entertainment
// Description: Test helpers for the embedded games (games/embedded.js): the slugs, a sync token
//              and an app with the games switched on (both, unless the test names others).
// ============================================================

import { EMBEDDED_GAMES } from '../../src/games/embedded.js';
import { makeTestApp } from './testApp.js';

export const GAMES = Object.keys(EMBEDDED_GAMES);
export const TOKEN = 'a-test-games-sync-token-of-32-characters-at-least';

// games: overrides of config.games, e.g. { embedded: ['bingo'] } or { syncToken: null }.
export const gamesApp = (games = {}, options) =>
  makeTestApp({ games: { embedded: GAMES, syncToken: TOKEN, ...games } }, options);
