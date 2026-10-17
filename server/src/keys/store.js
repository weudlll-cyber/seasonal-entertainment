// ============================================================
// File:        store.js
// Path:        server/src/keys/store.js
// Project:     Seasonal Entertainment
// Description: Data access for members' keys: the current key (public key, sealed private key,
//              optional recovery seal), a new key pair (first one or "start over": a new id,
//              the recovery seal gone), re-sealing the same private key (password change,
//              recovered access), and the recovery seal itself. Only sealed values are stored.
// ============================================================

const now = () => new Date().toISOString();

// { keyId, publicKey, sealedPrivateKey, recovery: { salt, sealed } | null } or null.
export function currentKey(db, userId) {
  const row = db
    .prepare(
      `SELECT s.key_id AS keyId, k.public_key AS publicKey, s.sealed_private AS sealedPrivateKey,
              s.recovery_salt AS recoverySalt, s.recovery_sealed AS recoverySealed
       FROM user_secret_keys s JOIN user_keys k ON k.id = s.key_id WHERE s.user_id = ?`
    )
    .get(userId);
  if (!row) return null;
  const { recoverySalt, recoverySealed, ...key } = row;
  return {
    ...key,
    recovery: recoverySealed ? { salt: recoverySalt, sealed: recoverySealed } : null,
  };
}

// A new key pair becomes the current one: a new key id, no recovery seal (the old code would
// open the old private key only). Returns the new key id.
export function storeNewKey(db, userId, publicKey, sealedPrivateKey) {
  return db.transaction(() => {
    const keyId = Number(
      db
        .prepare('INSERT INTO user_keys (user_id, public_key, created_at) VALUES (?, ?, ?)')
        .run(userId, publicKey, now()).lastInsertRowid
    );
    db.prepare(
      `INSERT INTO user_secret_keys (user_id, key_id, sealed_private) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET key_id = excluded.key_id,
         sealed_private = excluded.sealed_private, recovery_salt = NULL, recovery_sealed = NULL`
    ).run(userId, keyId, sealedPrivateKey);
    return keyId;
  })();
}

// The same private key, sealed again with a new wrapping key. false without a key.
export function resealKey(db, userId, sealedPrivateKey) {
  return (
    db
      .prepare('UPDATE user_secret_keys SET sealed_private = ? WHERE user_id = ?')
      .run(sealedPrivateKey, userId).changes === 1
  );
}

// recovery: { salt, sealed }, or null to remove it. false without a key.
export function setRecovery(db, userId, recovery) {
  return (
    db
      .prepare(
        'UPDATE user_secret_keys SET recovery_salt = ?, recovery_sealed = ? WHERE user_id = ?'
      )
      .run(recovery?.salt ?? null, recovery?.sealed ?? null, userId).changes === 1
  );
}
