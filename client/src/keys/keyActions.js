// ============================================================
// File:        keyActions.js
// Path:        client/src/keys/keyActions.js
// Project:     Seasonal Entertainment
// Description: What the browser does with a member's keys (docs/CHAT.md, "Keys and the
//              recovery code"), without any screen: create the first key pair after a login,
//              open the sealed private key with the password's wrapping key, recover it with a
//              recovery code, start over with a new pair, make or remove a recovery code, and
//              re-seal for a new password. The private key leaves the browser only sealed.
//              Crypto: shared/crypto.js, loaded when needed.
// ============================================================

import { api } from '../api/http.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

export const fetchKey = async () => (await api('/keys/me')).key;

// A new key pair, sealed for this password. kind 'first' creates it, 'replace' starts over.
async function newPair(kind, { authKey, wrapKey }) {
  const { newKeyPair, sealBytes } = await crypto();
  const { publicKey, privateKey } = await newKeyPair();
  const sealedPrivateKey = await sealBytes(privateKey, wrapKey);
  const { keyId } = await api(kind === 'first' ? '/keys' : '/keys/replace', {
    method: 'POST',
    body: { authKey, publicKey, sealedPrivateKey },
  });
  return { keyId, privateKey };
}

// After a password is known (login, registration, unlock): the key pair is created if the
// account has none yet, otherwise its private key is opened. Returns
// { status: 'unlocked', keyId, privateKey, created, hasRecovery } or { status: 'broken',
// hasRecovery } when the password no longer opens it (an admin reset the password, say).
export async function openWithPassword(passwordKeys) {
  const key = await fetchKey();
  if (!key) {
    const pair = await newPair('first', passwordKeys);
    return { status: 'unlocked', created: true, hasRecovery: false, ...pair };
  }
  const hasRecovery = Boolean(key.recovery);
  const { openSealed } = await crypto();
  const privateKey = await openSealed(key.sealedPrivateKey, passwordKeys.wrapKey);
  if (!privateKey) {
    // A wrong password opens nothing either: only a right one that fails means "broken".
    // Throws (401) for a wrong password.
    await api('/keys/check', { method: 'POST', body: { authKey: passwordKeys.authKey } });
    return { status: 'broken', hasRecovery };
  }
  return { status: 'unlocked', created: false, hasRecovery, keyId: key.keyId, privateKey };
}

// The recovery code opens the second seal; the private key is then sealed again for the
// current password. null when the code is wrong.
export async function recoverWithCode(code, passwordKeys) {
  const { deriveRecoveryKey, openSealed, sealBytes } = await crypto();
  const key = await fetchKey();
  if (!key?.recovery) return null;
  const recoveryKey = await deriveRecoveryKey(code, key.recovery.salt);
  const privateKey = await openSealed(key.recovery.sealed, recoveryKey);
  if (!privateKey) return null;
  const sealedPrivateKey = await sealBytes(privateKey, passwordKeys.wrapKey);
  await api('/keys/sealed', {
    method: 'PUT',
    body: { authKey: passwordKeys.authKey, sealedPrivateKey },
  });
  return { keyId: key.keyId, privateKey };
}

// "Start over without my old messages": a new key pair; old direct messages stay unreadable.
export const startOver = (passwordKeys) => newPair('replace', passwordKeys);

// A new recovery code for an unlocked private key; replaces any old one. Returns the code,
// to be shown once.
export async function createRecoveryCode(privateKey) {
  const { deriveRecoveryKey, newRecoveryCode, newSalt, sealBytes } = await crypto();
  const code = await newRecoveryCode();
  const salt = await newSalt();
  const sealed = await sealBytes(privateKey, await deriveRecoveryKey(code, salt));
  await api('/keys/recovery', { method: 'PUT', body: { salt, sealed } });
  return code;
}

export const removeRecoveryCode = () => api('/keys/recovery', { method: 'DELETE' });

// For a password change: the private key sealed for the new password, or undefined when the
// current password does not open it (nothing to carry over).
export async function resealForNewPassword(currentWrapKey, newWrapKey) {
  const key = await fetchKey();
  if (!key) return undefined;
  const { openSealed, sealBytes } = await crypto();
  const privateKey = await openSealed(key.sealedPrivateKey, currentWrapKey);
  return privateKey ? sealBytes(privateKey, newWrapKey) : undefined;
}
