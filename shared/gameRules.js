// ============================================================
// File:        gameRules.js
// Path:        shared/gameRules.js
// Project:     Seasonal Entertainment
// Description: The games hub's fixed choices, shared by server validation and client forms:
//              statuses, who may see a game, and the images a game card may use (site assets
//              only, so no outside image is ever loaded and the CSP stays strict), and the
//              development's fake game with an open sign-up (DEV_TEST_GAME).
// ============================================================

export const GAME_STATUSES = ['available', 'coming_soon', 'maintenance'];
export const GAME_STATUS_LABELS = {
  available: 'Available',
  coming_soon: 'Coming soon',
  maintenance: 'Maintenance',
};

// Who sees the card: everyone (guests too), signed-in members, or organisers and admins.
export const GAME_VISIBILITIES = ['everyone', 'members', 'organisers'];

export const GAME_IMAGES = ['seasonal-tokens', 'spring', 'summer', 'autumn', 'winter'];

// Game pages live under /games/ (e.g. /games/race).
export const GAME_PATH_PATTERN = /^\/games\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Development only (docs/OPEN-ROUNDS.md, "Trying it locally"): the fake game that
// npm run dev:game-status adds, its page (a placeholder in development builds) and the fake host
// its sign-up status comes from (".test" never resolves on the real internet).
export const DEV_TEST_GAME = { path: '/games/open-rounds-test', statusHost: 'status.games.test' };
