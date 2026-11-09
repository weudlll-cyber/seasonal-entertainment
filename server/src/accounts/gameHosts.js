// ============================================================
// File:        gameHosts.js
// Path:        server/src/accounts/gameHosts.js
// Project:     Seasonal Entertainment
// Description: Who may host matches, per embedded game (docs/AUTH.md, "Embedded games"; decided
//              2026-11-09): an admin always, a member only for the games an admin granted
//              them (user_game_hosts: one row per account and game slug). The games are the
//              whole allowlist of games/embedded.js, switched on or not, so a game added there
//              gets its own grant with nothing else to change. A change that really changes
//              something is noted for the games as "rights" (accountChanges.js), in the same
//              transaction, so the game signs the member in again.
// ============================================================

import { EMBEDDED_GAMES } from '../games/embedded.js';
import { noteAccountChange } from './accountChanges.js';

export const isGame = (slug) => Object.hasOwn(EMBEDDED_GAMES, slug);

// The games an admin granted this account (slugs, in the allowlist's order).
export function grantedGames(db, userId) {
  const granted = new Set(
    db
      .prepare('SELECT game FROM user_game_hosts WHERE user_id = ?')
      .all(userId)
      .map((row) => row.game)
  );
  return Object.keys(EMBEDDED_GAMES).filter((slug) => granted.has(slug));
}

// The same for many accounts at once (the admin list): user id -> slugs.
export function grantedGamesByUser(db) {
  const byUser = new Map();
  for (const { userId, game } of db
    .prepare('SELECT user_id AS userId, game FROM user_game_hosts')
    .all()) {
    if (isGame(game)) byUser.set(userId, [...(byUser.get(userId) ?? []), game]);
  }
  return byUser;
}

// X-Acting-User-Can-Host for that game (games/embeddedRoutes.js).
export const mayHost = (db, user, game) =>
  user.role === 'admin' ||
  Boolean(
    db.prepare('SELECT 1 FROM user_game_hosts WHERE user_id = ? AND game = ?').get(user.id, game)
  );

// Grants or takes back hosting `game` (a slug of the allowlist); true when it changed.
export function setGameHost(db, user, game, value) {
  return db.transaction(() => {
    const changed = value
      ? db
          .prepare(
            'INSERT INTO user_game_hosts (user_id, game) VALUES (?, ?) ON CONFLICT DO NOTHING'
          )
          .run(user.id, game).changes === 1
      : db.prepare('DELETE FROM user_game_hosts WHERE user_id = ? AND game = ?').run(user.id, game)
          .changes === 1;
    if (changed) noteAccountChange(db, user.id, 'rights');
    return changed;
  })();
}
