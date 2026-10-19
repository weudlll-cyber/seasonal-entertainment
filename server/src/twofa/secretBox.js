// ============================================================
// File:        secretBox.js
// Path:        server/src/twofa/secretBox.js
// Project:     Seasonal Entertainment
// Description: 2FA (TOTP) secrets encrypted at rest: authenticated encryption with the
//              project's libsodium helper (shared/crypto.js: secretbox, a fresh nonce each
//              time) under SECRET_ENCRYPTION_KEY (secretKey.js). Stored as "enc1:" + base64. A
//              secret that does not open (another key, a changed row) never passes: the caller
//              gets null and the log says why, without any part of the secret. Recovery codes
//              stay hashed (store.js). sealStoredSecrets encrypts rows from before this, once.
// ============================================================

import { openSealed, sealBytes } from '@seasonal-entertainment/shared/crypto.js';

const PREFIX = 'enc1:';

export const isSealed = (stored) => stored.startsWith(PREFIX);

export async function sealSecret(secret, key) {
  return PREFIX + (await sealBytes(new TextEncoder().encode(secret), key));
}

// The secret, or null when it does not open with this key (logged, with the user's id only).
export async function openSecret(stored, key, userId, log = console.error) {
  const bytes = isSealed(stored) ? await openSealed(stored.slice(PREFIX.length), key) : null;
  if (!bytes) {
    log(
      `[2fa] the 2FA secret of user ${userId} cannot be decrypted: SECRET_ENCRYPTION_KEY is not ` +
        'the key it was stored with (or the row was changed); this login is refused'
    );
    return null;
  }
  return new TextDecoder().decode(bytes);
}

// At start: encrypts every secret still stored in plain text (idempotent: sealed rows are
// skipped), and warns when stored secrets do not open with this key. Returns
// { sealed, unreadable } counts.
export async function sealStoredSecrets(db, key, log = console.warn) {
  const rows = db.prepare('SELECT user_id AS userId, secret FROM two_factor').all();
  const update = db.prepare('UPDATE two_factor SET secret = ? WHERE user_id = ? AND secret = ?');
  let sealed = 0;
  let unreadable = 0;
  for (const { userId, secret } of rows) {
    if (!isSealed(secret)) {
      sealed += update.run(await sealSecret(secret, key), userId, secret).changes;
    } else if (!(await openSealed(secret.slice(PREFIX.length), key))) {
      unreadable += 1;
    }
  }
  if (sealed) log(`[2fa] encrypted ${sealed} stored 2FA secrets (first start with encryption)`);
  if (unreadable) {
    log(
      `[2fa] ${unreadable} stored 2FA secrets do not open with SECRET_ENCRYPTION_KEY: those ` +
        'accounts cannot pass 2FA until the right key is set (or 2FA is reset for them)'
    );
  }
  return { sealed, unreadable };
}
