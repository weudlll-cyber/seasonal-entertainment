// ============================================================
// File:        tokens.js
// Path:        server/src/embed/tokens.js
// Project:     Seasonal Entertainment
// Description: Embed tokens (docs/AUTH.md, "Embed tokens"): 32 random bytes, handed to the
//              embedded chat on an approved foreign site by the login popup; valid 12 hours
//              (decision rule of 2026-10-19), for one account and one site. A token stops
//              working at once when it expires, the member logs out (here or on the site),
//              their session epoch changes (password change, 2FA on/off, admin reset), the
//              account is locked or deleted, or an admin removes the site from the list.
//              Only its SHA-256 is stored.
// ============================================================

import { createHash, randomBytes } from 'node:crypto';
import { findUserById } from '../accounts/userStore.js';

const TOKEN_HOURS = 12;
const hash = (token) => createHash('sha256').update(token).digest('hex');

// Returns { token, expiresAt }; the token itself is never stored.
export function issueToken(db, user, origin, now = Date.now()) {
  db.prepare('DELETE FROM embed_tokens WHERE expires_at <= ?').run(new Date(now).toISOString());
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now + TOKEN_HOURS * 60 * 60_000).toISOString();
  db.prepare(
    `INSERT INTO embed_tokens (token_hash, user_id, origin, session_epoch, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(hash(token), user.id, origin, user.sessionEpoch, new Date(now).toISOString(), expiresAt);
  return { token, expiresAt };
}

const COLUMNS = `id, user_id AS userId, origin, session_epoch AS sessionEpoch,
  expires_at AS expiresAt`;

// A row and its account, if it may still be used: not expired, its site still approved, the
// account still there, unlocked and on the same session epoch. Otherwise null.
function stillValid(db, origins, row, now) {
  if (!row || row.expiresAt <= new Date(now).toISOString() || !origins.allows(row.origin)) {
    return null;
  }
  const user = findUserById(db, row.userId);
  if (!user || user.locked || user.sessionEpoch !== row.sessionEpoch) return null;
  return { tokenId: row.id, origin: row.origin, user, sessionEpoch: row.sessionEpoch };
}

// The token as given by the embed: { tokenId, origin, user, sessionEpoch } or null.
export function findActiveToken(db, origins, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM embed_tokens WHERE token_hash = ?`)
    .get(hash(token));
  return stillValid(db, origins, row, now);
}

// The same check by id, for a socket that connected with a token earlier and for a file
// link made for one (uploads/fileLinks.js): { tokenId, origin, user, sessionEpoch } or null.
export function activeTokenById(db, origins, tokenId, now = Date.now()) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM embed_tokens WHERE id = ?`).get(tokenId);
  return stillValid(db, origins, row, now);
}
export const tokenStillActive = (db, origins, tokenId, now = Date.now()) =>
  Boolean(activeTokenById(db, origins, tokenId, now));

export const revokeToken = (db, tokenId) =>
  db.prepare('DELETE FROM embed_tokens WHERE id = ?').run(tokenId);
export const revokeUserTokens = (db, userId) =>
  db.prepare('DELETE FROM embed_tokens WHERE user_id = ?').run(userId);
export const revokeOriginTokens = (db, origin) =>
  db.prepare('DELETE FROM embed_tokens WHERE origin = ?').run(origin);
