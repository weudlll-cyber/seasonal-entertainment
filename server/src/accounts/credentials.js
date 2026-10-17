// ============================================================
// File:        credentials.js
// Path:        server/src/accounts/credentials.js
// Project:     Seasonal Entertainment
// Description: What the server receives instead of a password (docs/AUTH.md, "Login key
//              split"): the auth key the browser derived (32 bytes, base64) and, when a
//              verifier is set, the salt it used (16 bytes). The server checks their shape only;
//              it never sees the password, the master key or the wrapping key. Also the
//              pre-login salt for usernames that do not exist: deterministic, so asking twice
//              gives the same answer, as it would for a real account.
// ============================================================

import { createHmac } from 'node:crypto';
import { KEY_BYTES, SALT_BYTES, exactBytes } from '@seasonal-entertainment/shared/cryptoFormat.js';

export const authKeyField = (label = 'Auth key') => exactBytes(label, KEY_BYTES);
export const saltField = exactBytes('Salt', SALT_BYTES);

// HMAC of the lower-cased username, keyed with a key derived from the session secret (no new
// setting). Unknown names thus get a salt that looks like any other and never changes while
// the secret stays the same.
export function fakeSalt(sessionSecret, username) {
  const key = createHmac('sha256', sessionSecret).update('se-prelogin-salt').digest();
  return createHmac('sha256', key)
    .update(String(username).toLowerCase())
    .digest()
    .subarray(0, SALT_BYTES)
    .toString('base64');
}
