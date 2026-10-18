// ============================================================
// File:        userStore.js
// Path:        server/src/accounts/userStore.js
// Project:     Seasonal Entertainment
// Description: Data access for the users table. Rows come back as plain objects in
//              camelCase; the stored hash (bcrypt of the browser's auth key, or of the password
//              for a legacy account) never leaves this module except for verification.
// ============================================================

const COLUMNS = `id, username, email, role, can_start_games AS canStartGames, locked,
  session_epoch AS sessionEpoch, show_online AS showOnline, created_at AS createdAt`;

function toUser(row) {
  if (!row) return null;
  return {
    ...row,
    canStartGames: row.canStartGames === 1,
    locked: row.locked === 1,
    showOnline: row.showOnline === 1,
  };
}

export class DuplicateAccountError extends Error {
  constructor(field) {
    super(`${field} already taken`);
    this.field = field;
  }
}

// passwordHash: bcrypt of the auth key; kdfSalt: the salt the browser derived it with.
export function createUser(db, { username, email, passwordHash, kdfSalt, role = 'member' }) {
  try {
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO users (username, email, password_hash, kdf_salt, role) VALUES (?, ?, ?, ?, ?)'
      )
      .run(username, email, passwordHash, kdfSalt, role);
    return findUserById(db, Number(lastInsertRowid));
  } catch (err) {
    // The UNIQUE constraints (case-insensitive) decide; the message names the column.
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new DuplicateAccountError(err.message.includes('email') ? 'email' : 'username');
    }
    throw err;
  }
}

export function findUserById(db, id) {
  return toUser(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id));
}

// For login: the user plus the hash to verify against, and whether it is a legacy account.
export function findLoginByUsername(db, username) {
  const row = db
    .prepare(
      `SELECT ${COLUMNS}, password_hash AS passwordHash, legacy FROM users WHERE username = ?`
    )
    .get(username);
  if (!row) return null;
  const { passwordHash, legacy, ...user } = row;
  return { user: toUser(user), passwordHash, legacy: legacy === 1 };
}

// The salt the browser needs to derive this account's keys, and whether it is a legacy
// account; null for an unknown username (case-insensitive, like usernames).
export function findKdfSalt(db, username) {
  const row = db
    .prepare('SELECT kdf_salt AS salt, legacy FROM users WHERE username = ?')
    .get(username);
  return row ? { salt: row.salt, legacy: row.legacy === 1 } : null;
}

// A legacy account's first login: the new verifier and salt replace the old password hash.
// Only while the account is still legacy, so it happens exactly once; the epoch stays (the
// password is the same, no session needs to end). true when it was upgraded now.
export function upgradeLegacyAccount(db, id, passwordHash, kdfSalt) {
  return (
    db
      .prepare(
        'UPDATE users SET password_hash = ?, kdf_salt = ?, legacy = 0 WHERE id = ? AND legacy = 1'
      )
      .run(passwordHash, kdfSalt, id).changes === 1
  );
}

export function findPasswordHash(db, id) {
  return db.prepare('SELECT password_hash AS h FROM users WHERE id = ?').get(id)?.h ?? null;
}

// Stores a new verifier and its salt and bumps the epoch in one statement: every session
// stamped with the old epoch ends. Returns the new epoch.
export function setPasswordHash(db, id, passwordHash, kdfSalt) {
  return db
    .prepare(
      `UPDATE users SET password_hash = ?, kdf_salt = ?, legacy = 0,
         session_epoch = session_epoch + 1
       WHERE id = ? RETURNING session_epoch AS e`
    )
    .get(passwordHash, kdfSalt, id).e;
}

// Ends every session of the account without touching the password (2FA turned on or off).
// Returns the new epoch.
export function bumpSessionEpoch(db, id) {
  return db
    .prepare(
      'UPDATE users SET session_epoch = session_epoch + 1 WHERE id = ? RETURNING session_epoch AS e'
    )
    .get(id).e;
}

// "Show when I'm online" (the member's own setting).
export function setShowOnline(db, id, show) {
  db.prepare('UPDATE users SET show_online = ? WHERE id = ?').run(show ? 1 : 0, id);
}

// Of these account ids, the ones that let others see them online.
export function idsShowingOnline(db, ids) {
  const list = [...ids];
  if (list.length === 0) return new Set();
  return new Set(
    db
      .prepare(
        `SELECT id FROM users WHERE show_online = 1 AND id IN (${list.map(() => '?').join(',')})`
      )
      .all(...list)
      .map((r) => r.id)
  );
}

export function countAdmins(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
}

// What the client may see about an account.
export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    canStartGames: user.canStartGames || user.role === 'admin',
    showOnline: user.showOnline,
  };
}
