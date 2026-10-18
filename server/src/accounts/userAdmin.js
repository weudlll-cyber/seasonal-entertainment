// ============================================================
// File:        userAdmin.js
// Path:        server/src/accounts/userAdmin.js
// Project:     Seasonal Entertainment
// Description: Admin-side changes to accounts: list/search, role, "can start games", lock.
//              The last active admin can be neither demoted nor locked: enforced here, in the
//              data layer, so no route can bypass it (as in the race game).
// ============================================================

import { escapeLike } from '../db/like.js';

export class LastAdminError extends Error {
  constructor() {
    super('The last admin cannot be removed.');
  }
}

const LIST_COLUMNS = `id, username, email, role, can_start_games AS canStartGames, locked,
  created_at AS createdAt,
  EXISTS (SELECT 1 FROM two_factor t WHERE t.user_id = users.id AND t.enabled_at IS NOT NULL)
    AS twoFactorEnabled`;

// Search matches username or email, case-insensitively; results in username order.
export function listUsers(db, { search = '', limit = 200 } = {}) {
  const pattern = `%${escapeLike(search)}%`;
  return db
    .prepare(
      `SELECT ${LIST_COLUMNS} FROM users
       WHERE username LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
       ORDER BY username COLLATE NOCASE LIMIT ?`
    )
    .all(pattern, pattern, limit)
    .map((u) => ({
      ...u,
      canStartGames: u.canStartGames === 1,
      locked: u.locked === 1,
      twoFactorEnabled: u.twoFactorEnabled === 1,
    }));
}

// Admins who can still act: role admin and not locked.
function countActiveAdmins(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND locked = 0").get().n;
}

// Would this change leave no active admin? Checked inside the same transaction as the write.
function guardLastAdmin(db, user, { role, locked }) {
  const activeNow = user.role === 'admin' && !user.locked;
  const activeAfter = (role ?? user.role) === 'admin' && !(locked ?? user.locked);
  if (activeNow && !activeAfter && countActiveAdmins(db) <= 1) throw new LastAdminError();
}

export function setRole(db, user, role) {
  db.transaction(() => {
    guardLastAdmin(db, user, { role });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  })();
}

export function setLocked(db, user, locked) {
  db.transaction(() => {
    guardLastAdmin(db, user, { locked });
    db.prepare('UPDATE users SET locked = ? WHERE id = ?').run(locked ? 1 : 0, user.id);
  })();
}

export function setCanStartGames(db, user, value) {
  db.prepare('UPDATE users SET can_start_games = ? WHERE id = ?').run(value ? 1 : 0, user.id);
}
