// ============================================================
// File:        store.js
// Path:        server/src/games/store.js
// Project:     Seasonal Entertainment
// Description: Data access for the games hub: the cards a viewer may see (never a game's
//              sign-up status URL: only admins and the poller read it, openRounds.js), all for
//              admins, create/update/delete.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';

const COLUMNS = 'id, name, description, image, status, path, visibility, position';
const ADMIN_COLUMNS = `${COLUMNS}, status_url AS statusUrl`;
const ORDER = 'ORDER BY position, id';

export class DuplicatePathError extends Error {}

// Which visibilities a viewer passes: guests see "everyone" only.
function visibleTo(user) {
  if (!user) return ['everyone'];
  return roleAtLeast(user.role, 'organiser')
    ? ['everyone', 'members', 'organisers']
    : ['everyone', 'members'];
}

export function listGamesFor(db, user) {
  const allowed = visibleTo(user);
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM games WHERE visibility IN (${allowed.map(() => '?').join(', ')}) ${ORDER}`
    )
    .all(...allowed);
}

export function listAllGames(db) {
  return db.prepare(`SELECT ${ADMIN_COLUMNS} FROM games ${ORDER}`).all();
}

export function findGame(db, id) {
  return db.prepare(`SELECT ${ADMIN_COLUMNS} FROM games WHERE id = ?`).get(id);
}

// The games whose open sign-ups the poller reads: { id, statusUrl }.
export function gamesWithStatusUrl(db) {
  return db
    .prepare(`SELECT id, status_url AS statusUrl FROM games WHERE status_url IS NOT NULL ${ORDER}`)
    .all();
}

function unique(run) {
  try {
    return run();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new DuplicatePathError();
    throw err;
  }
}

const values = (g) => [
  g.name,
  g.description ?? '',
  g.image,
  g.status,
  g.path,
  g.visibility,
  g.statusUrl || null,
];

export function createGame(db, game) {
  return unique(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO games (name, description, image, status, path, visibility, status_url, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM games))`
      )
      .run(...values(game));
    return findGame(db, Number(lastInsertRowid));
  });
}

export function updateGame(db, id, game) {
  unique(() =>
    db
      .prepare(
        `UPDATE games SET name = ?, description = ?, image = ?, status = ?, path = ?, visibility = ?,
           status_url = ? WHERE id = ?`
      )
      .run(...values(game), id)
  );
  return findGame(db, id);
}

export function deleteGame(db, id) {
  db.prepare('DELETE FROM games WHERE id = ?').run(id);
}
