// ============================================================
// File:        seed.js
// Path:        server/src/games/seed.js
// Project:     Seasonal Entertainment
// Description: First-start games hub entry: "Seasonal Race", coming soon, for everyone. The
//              race game itself lives in its own repository and is not connected yet.
// ============================================================

export const SEED_GAMES = [
  {
    name: 'Seasonal Race',
    description: 'A race game for the Seasonal Tokens community.',
    image: 'seasonal-tokens',
    status: 'coming_soon',
    path: '/games/race',
    visibility: 'everyone',
  },
];

export function seedGames(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM games').get().n > 0) return 0;
  const insert = db.prepare(
    `INSERT INTO games (name, description, image, status, path, visibility, position)
     VALUES (@name, @description, @image, @status, @path, @visibility, 1)`
  );
  for (const game of SEED_GAMES) insert.run(game);
  return SEED_GAMES.length;
}
