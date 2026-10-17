// ============================================================
// File:        credentials.js
// Path:        client/src/session/credentials.js
// Project:     Seasonal Entertainment
// Description: Turns a typed password into what the server receives instead (docs/AUTH.md,
//              "Login key split"): Argon2id in the browser gives a master key, from which the
//              auth key (sent) and the wrapping key (kept in the browser) are derived. Used by
//              every form with a password: login, registration, password change, 2FA, admin
//              password reset. The crypto module (libsodium, WebAssembly) is loaded only when a
//              password is actually used.
// ============================================================

import { api } from '../api/http.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

// A new password: a fresh random salt and the keys derived with it.
export async function keysForNewPassword(password) {
  const { deriveAccountKeys, newSalt } = await crypto();
  const salt = await newSalt();
  return { salt, ...(await deriveAccountKeys(password, salt)) };
}

// An existing account's password: derived with the salt the server gives for that name.
export async function keysForPassword(username, password) {
  const { deriveAccountKeys } = await crypto();
  const { salt } = await api('/auth/prelogin', { method: 'POST', body: { username } });
  return deriveAccountKeys(password, salt);
}

// Logs in. A legacy account (from before the key split) sends its password this once,
// together with a new salt and auth key, which replace the old hash on the server.
// Returns the server's answer and the wrapping key (it opens the private key, keys/).
export async function logIn(username, password) {
  const { deriveAccountKeys, newSalt } = await crypto();
  const pre = await api('/auth/prelogin', { method: 'POST', body: { username } });
  if (pre.legacy) {
    const salt = await newSalt();
    const { authKey, wrapKey } = await deriveAccountKeys(password, salt);
    const body = { username, password, salt, authKey };
    return { answer: await api('/auth/legacy-login', { method: 'POST', body }), wrapKey };
  }
  const { authKey, wrapKey } = await deriveAccountKeys(password, pre.salt);
  const answer = await api('/auth/login', { method: 'POST', body: { username, authKey } });
  return { answer, wrapKey };
}
