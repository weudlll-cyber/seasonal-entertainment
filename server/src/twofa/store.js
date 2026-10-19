// ============================================================
// File:        store.js
// Path:        server/src/twofa/store.js
// Project:     Seasonal Entertainment
// Description: Data access for two-factor authentication: pending/enabled TOTP secrets
//              (stored encrypted, secretBox.js; this module gets and gives them sealed), the
//              replay guard, recovery codes (stored as SHA-256 hashes, each usable once), and
//              the check of a second factor during login or disabling.
// ============================================================

import { createHash, randomBytes } from 'node:crypto';
import { openSecret } from './secretBox.js';
import { base32Encode, matchStep } from './totp.js';

const RECOVERY_CODE_COUNT = 10;
const now = () => new Date().toISOString();

// Recovery codes are random (40 bits each), so a fast hash is enough; shown as "abcd-efgh".
const normalise = (code) => String(code).replace(/[\s-]/g, '').toLowerCase();
const hashCode = (code) => createHash('sha256').update(normalise(code)).digest('hex');

export function getTwoFactor(db, userId) {
  const row = db
    .prepare('SELECT secret, enabled_at, last_step FROM two_factor WHERE user_id = ?')
    .get(userId);
  return row && { secret: row.secret, enabled: row.enabled_at !== null, lastStep: row.last_step };
}

export function isTwoFactorEnabled(db, userId) {
  return getTwoFactor(db, userId)?.enabled === true;
}

// A new secret (sealed: secretBox.js) replaces any earlier pending one; an enabled one is never
// overwritten here.
export function savePendingSecret(db, userId, sealedSecret) {
  db.prepare(
    `INSERT INTO two_factor (user_id, secret) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret, last_step = 0
     WHERE two_factor.enabled_at IS NULL`
  ).run(userId, sealedSecret);
}

// Enables 2FA and issues fresh recovery codes (returned in plain text, this one time only).
export function enableTwoFactor(db, userId, step) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  db.transaction(() => {
    db.prepare('UPDATE two_factor SET enabled_at = ?, last_step = ? WHERE user_id = ?').run(
      now(),
      step,
      userId
    );
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
    const insert = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
    for (const code of codes) insert.run(userId, hashCode(code));
  })();
  return codes;
}

export function disableTwoFactor(db, userId) {
  db.transaction(() => {
    db.prepare('DELETE FROM two_factor WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
  })();
}

// Checks a TOTP code or a recovery code for an enabled account. Accepting marks it used in
// the same statement (step moves forward / code gets used_at), so it cannot be used twice.
// key: SECRET_ENCRYPTION_KEY's bytes; a secret that does not open with it accepts no code.
// Recovery codes are hashed, not encrypted: they work whatever the key.
export async function acceptSecondFactor(
  db,
  key,
  userId,
  { code, recoveryCode },
  timeMs = Date.now()
) {
  const factor = getTwoFactor(db, userId);
  if (!factor?.enabled) return false;
  if (code) {
    const secret = await openSecret(factor.secret, key, userId);
    if (secret === null) return false;
    const step = matchStep(secret, code, timeMs);
    if (step === null) return false;
    const { changes } = db
      .prepare('UPDATE two_factor SET last_step = ? WHERE user_id = ? AND last_step < ?')
      .run(step, userId, step);
    return changes === 1;
  }
  if (recoveryCode) {
    const { changes } = db
      .prepare(
        'UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL'
      )
      .run(now(), userId, hashCode(recoveryCode));
    return changes === 1;
  }
  return false;
}
