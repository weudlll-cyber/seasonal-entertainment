// ============================================================
// File:        embedded.js
// Path:        server/src/games/embedded.js
// Project:     Seasonal Entertainment
// Description: The games that can run inside this site at /games/<slug>, each its own project
//              with its own installer (docs/AUTH.md, "Embedded games"; decided 2026-11-04): a
//              fixed allowlist, Seasonal Bingo Royale (bingo), Seasonal Mini Games (mini-games)
//              and Seasonal Race (race; decided 2026-11-11). Which of them are switched on is
//              GAMES_EMBEDDED, a comma list of slugs; GAMES_BINGO_EMBEDDED=1, the switch of the
//              Bingo-only installer, still puts bingo in the list. Each game has the chat room
//              of its slug (chat/seed.js, ensureGameRooms; decided 2026-11-04); the race's is
//              the seeded "Seasonal Race" room, so it is there before the race is switched on.
//              The installer's list is the same (deploy/install/lib/games.sh).
// ============================================================

// slug → the game's name and the name of its chat room (the room's slug is the game's).
export const EMBEDDED_GAMES = {
  bingo: { name: 'Seasonal Bingo Royale', roomName: 'Bingo' },
  'mini-games': { name: 'Seasonal Mini Games', roomName: 'Mini Games' },
  race: { name: 'Seasonal Race', roomName: 'Seasonal Race' },
};

// The switched-on slugs, in the allowlist's order. Unknown slugs stop the start, as every
// other wrong value does (config.js). bingoOn: GAMES_BINGO_EMBEDDED, read as on/off there.
export function readEmbeddedGames(list, bingoOn) {
  const named = new Set(
    (list ?? '')
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean)
  );
  for (const slug of named) {
    if (!Object.hasOwn(EMBEDDED_GAMES, slug)) {
      throw new Error(
        `GAMES_EMBEDDED knows only ${Object.keys(EMBEDDED_GAMES).join(', ')}, got "${slug}"`
      );
    }
  }
  if (bingoOn) named.add('bingo');
  return Object.keys(EMBEDDED_GAMES).filter((slug) => named.has(slug));
}
