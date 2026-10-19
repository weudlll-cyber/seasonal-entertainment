// ============================================================
// File:        credentials.js
// Path:        client/src/session/credentials.js
// Project:     Seasonal Entertainment
// Description: Turns a typed password into what the server receives instead (docs/AUTH.md,
//              "Login key split"): Argon2id in the browser gives a master key, from which the
//              auth key (sent) and the wrapping key (kept in the browser) are derived. Used by
//              every form with a password: login, registration, password change, 2FA, admin
//              password reset. Argon2id runs in a Web Worker (passwordHashing.js) so the page
//              keeps responding; the crypto module (libsodium, WebAssembly) is loaded only when
//              a password is actually used.
// ============================================================

import { api } from '../api/http.js';
import { deriveAccountKeys } from './passwordHashing.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

// A new password: a fresh random salt and the keys derived with it.
export async function keysForNewPassword(password) {
  const salt = await (await crypto()).newSalt();
  return { salt, ...(await deriveAccountKeys(password, salt)) };
}

// An existing account's password: derived with the salt the server gives for that name.
export async function keysForPassword(username, password) {
  const { salt } = await api('/auth/prelogin', { method: 'POST', body: { username } });
  return deriveAccountKeys(password, salt);
}

// Logs in. Returns the server's answer and the password's keys { authKey, wrapKey }: the
// wrapping key opens the private key, the auth key proves the password to the keys routes
// (keys/).
export async function logIn(username, password) {
  const passwordKeys = await keysForPassword(username, password);
  const body = { username, authKey: passwordKeys.authKey };
  return { answer: await api('/auth/login', { method: 'POST', body }), passwordKeys };
}
