// ============================================================
// File:        userStore.js
// Path:        server/src/accounts/userStore.js
// Project:     Seasonal Entertainment
// Description: Data access for the users table. Rows come back as plain objects in
//              camelCase; the password hash never leaves this module except for verification.
// ============================================================

const COLUMNS = `id, username, email, role, can_start_games AS canStartGames, locked,
  session_epoch AS sessionEpoch, created_at AS createdAt`;

function toUser(row) {
  if (!row) return null;
  return { ...row, canStartGames: row.canStartGames === 1, locked: row.locked === 1 };
}

export class DuplicateAccountError extends Error {
  constructor(field) {
    super(`${field} already taken`);
    this.field = field;
  }
}

export function createUser(db, { username, email, passwordHash, role = 'member' }) {
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(username, email, passwordHash, role);
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

// For login: the user plus the hash to verify against.
export function findLoginByUsername(db, username) {
  const row = db
    .prepare(`SELECT ${COLUMNS}, password_hash AS passwordHash FROM users WHERE username = ?`)
    .get(username);
  if (!row) return null;
  const { passwordHash, ...user } = row;
  return { user: toUser(user), passwordHash };
}

export function findPasswordHash(db, id) {
  return db.prepare('SELECT password_hash AS h FROM users WHERE id = ?').get(id)?.h ?? null;
}

// Stores a new hash and bumps the epoch in one statement: every session stamped with the
// old epoch ends. Returns the new epoch.
export function setPasswordHash(db, id, passwordHash) {
  return db
    .prepare(
      'UPDATE users SET password_hash = ?, session_epoch = session_epoch + 1 WHERE id = ? RETURNING session_epoch AS e'
    )
    .get(passwordHash, id).e;
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
  };
}
