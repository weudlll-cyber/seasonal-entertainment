// ============================================================
// File:        store.js
// Path:        server/src/twofa/store.js
// Project:     Seasonal Entertainment
// Description: Data access for two-factor authentication: pending/enabled TOTP secrets
//              (stored encrypted, secretBox.js; this module gets and gives them sealed), the
//              replay guard, recovery codes (stored as keyed hashes, each usable once; codes
//              issued before 2026-11-22 as plain SHA-256), and the check of a second factor
//              during login or disabling.
// ============================================================

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { openSecret } from './secretBox.js';
import { base32Encode, matchStep } from './totp.js';

const RECOVERY_CODE_COUNT = 10;
const now = () => new Date().toISOString();

// Recovery codes are random (40 bits each), shown as "abcd-efgh" and hashed in a cleaned form
// (spaces and dashes out, lower case). The scheme and its names are seasonal-kit's
// (src/server/recoveryCodes.ts, its "hex" style; decided 2026-11-22): new codes are stored as
// recoveryHash, HMAC-SHA-256 under RECOVERY_CODE_KEY, so a stolen database alone gives nothing
// to brute-force; codes issued before stay legacyHash, plain SHA-256, and keep working once
// each without an end date (decided 2026-11-22). The row's scheme column says which.
const formOf = (code) => String(code).replace(/[\s-]/g, '').toLowerCase();
const recoveryHash = (code, key) => createHmac('sha256', key).update(formOf(code)).digest();
const legacyHash = (code) => createHash('sha256').update(formOf(code)).digest();

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

// Enables 2FA and issues fresh recovery codes (returned in plain text, this one time only),
// stored keyed with recoveryCodeKey (RECOVERY_CODE_KEY's bytes).
export function enableTwoFactor(db, recoveryCodeKey, userId, step) {
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
    const insert = db.prepare(
      "INSERT INTO recovery_codes (user_id, code_hash, scheme) VALUES (?, ?, 'hmac')"
    );
    for (const code of codes) {
      insert.run(userId, recoveryHash(code, recoveryCodeKey).toString('hex'));
    }
  })();
  return codes;
}

export function disableTwoFactor(db, userId) {
  db.transaction(() => {
    db.prepare('DELETE FROM two_factor WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
  })();
}

// Marks the account's unused recovery code that matches `code` used. Every unused code is
// compared, in constant time, against the typed code's hash in that row's scheme; the update
// takes a code only while it is unused, so two requests at once cannot both use it.
function useRecoveryCode(db, recoveryCodeKey, userId, code) {
  const typed = { hmac: recoveryHash(code, recoveryCodeKey), legacy: legacyHash(code) };
  const rows = db
    .prepare(
      'SELECT id, code_hash, scheme FROM recovery_codes WHERE user_id = ? AND used_at IS NULL'
    )
    .all(userId);
  // filter, not find: every row is compared, whichever one matches.
  const [match] = rows.filter(({ code_hash: hash, scheme }) => {
    const stored = Buffer.from(hash, 'hex');
    return stored.length === typed[scheme].length && timingSafeEqual(stored, typed[scheme]);
  });
  if (!match) return false;
  const { changes } = db
    .prepare('UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .run(now(), match.id);
  return changes === 1;
}

// Checks a TOTP code or a recovery code for an enabled account. Accepting marks it used at once
// (step moves forward / code gets used_at), so it cannot be used twice.
// keys: the config's secretKey (SECRET_ENCRYPTION_KEY's bytes; a secret that does not open with
// it accepts no code) and recoveryCodeKey (RECOVERY_CODE_KEY's bytes). Recovery codes are
// hashed, not encrypted: they work whatever SECRET_ENCRYPTION_KEY is, but a code issued since
// 2026-11-22 only under the RECOVERY_CODE_KEY it was stored with.
export async function acceptSecondFactor(
  db,
  { secretKey, recoveryCodeKey },
  userId,
  { code, recoveryCode },
  timeMs = Date.now()
) {
  const factor = getTwoFactor(db, userId);
  if (!factor?.enabled) return false;
  if (code) {
    const secret = await openSecret(factor.secret, secretKey, userId);
    if (secret === null) return false;
    const step = matchStep(secret, code, timeMs);
    if (step === null) return false;
    const { changes } = db
      .prepare('UPDATE two_factor SET last_step = ? WHERE user_id = ? AND last_step < ?')
      .run(step, userId, step);
    return changes === 1;
  }
  if (recoveryCode) return useRecoveryCode(db, recoveryCodeKey, userId, recoveryCode);
  return false;
}
