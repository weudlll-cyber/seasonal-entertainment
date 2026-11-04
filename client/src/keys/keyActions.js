// ============================================================
// File:        keyActions.js
// Path:        client/src/keys/keyActions.js
// Project:     Seasonal Entertainment
// Description: What the browser does with a member's keys (docs/CHAT.md, "Keys and the
//              recovery code"), without any screen: create the first key pair after a login,
//              open the sealed private key with the password's wrapping key, recover it with a
//              recovery code, start over with a new pair, make or remove a recovery code, and
//              re-seal for a new password. For an account without a password (made with
//              Discord; docs/CHAT.md, "Accounts without a password"): a first key pair protected
//              by a recovery code alone, and a first password that seals the key from then on.
//              The private key leaves the browser only sealed.
//              Crypto: shared/crypto.js, loaded when needed; the recovery code's Argon2id runs in
//              the password-hashing worker (session/passwordHashing.js).
// ============================================================

import { api } from '../api/http.js';
import { keysForNewPassword } from '../session/credentials.js';
import { deriveRecoveryKey } from '../session/passwordHashing.js';

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
// current password (passwordKeys; none for an account without a password, whose stored key
// is the recovery seal itself). null when the code is wrong.
export async function recoverWithCode(code, passwordKeys) {
  const { openSealed, sealBytes } = await crypto();
  const key = await fetchKey();
  if (!key?.recovery) return null;
  const recoveryKey = await deriveRecoveryKey(code, key.recovery.salt);
  const privateKey = await openSealed(key.recovery.sealed, recoveryKey);
  if (!privateKey) return null;
  if (passwordKeys) {
    const sealedPrivateKey = await sealBytes(privateKey, passwordKeys.wrapKey);
    await api('/keys/sealed', {
      method: 'PUT',
      body: { authKey: passwordKeys.authKey, sealedPrivateKey },
    });
  }
  return { keyId: key.keyId, privateKey };
}

// A new code and the private key sealed with it: { code, salt, sealed }.
async function sealWithNewCode(privateKey) {
  const { newRecoveryCode, newSalt, sealBytes } = await crypto();
  const code = await newRecoveryCode();
  const salt = await newSalt();
  return { code, salt, sealed: await sealBytes(privateKey, await deriveRecoveryKey(code, salt)) };
}

// An account without a password: a key pair protected by a recovery code only (its stored
// sealed key is the recovery seal). kind 'first' or 'replace' (start over). The server asks for
// a fresh Discord login instead of a password. Returns { keyId, privateKey, code }.
export async function newPairWithRecoveryCode(kind = 'first') {
  const { newKeyPair } = await crypto();
  const { publicKey, privateKey } = await newKeyPair();
  const { code, salt, sealed } = await sealWithNewCode(privateKey);
  if (kind === 'first') {
    const body = { publicKey, sealedPrivateKey: sealed, recovery: { salt, sealed } };
    const { keyId } = await api('/keys', { method: 'POST', body });
    return { keyId, privateKey, code };
  }
  const { keyId } = await api('/keys/replace', {
    method: 'POST',
    body: { publicKey, sealedPrivateKey: sealed },
  });
  await api('/keys/recovery', { method: 'PUT', body: { salt, sealed } });
  return { keyId, privateKey, code };
}

// The first password of an account made with Discord: the server stores it (proven by a fresh
// Discord login), with the private key sealed for it when this device has it open (privateKey;
// otherwise the recovery code opens it later and seals it then). Returns the password's keys
// { authKey, wrapKey }.
export async function setFirstPassword(password, privateKey) {
  const { salt, authKey, wrapKey } = await keysForNewPassword(password);
  const { sealBytes } = await crypto();
  const sealedPrivateKey = privateKey ? await sealBytes(privateKey, wrapKey) : undefined;
  await api('/auth/password/first', { method: 'POST', body: { salt, authKey, sealedPrivateKey } });
  return { authKey, wrapKey };
}

// "Start over without my old messages": a new key pair; old direct messages stay unreadable.
export const startOver = (passwordKeys) => newPair('replace', passwordKeys);

// A new recovery code for an unlocked private key; replaces any old one. authKey: the current
// password's, which the server asks for. Returns the code, to be shown once.
export async function createRecoveryCode(privateKey, authKey) {
  const { code, salt, sealed } = await sealWithNewCode(privateKey);
  await api('/keys/recovery', { method: 'PUT', body: { salt, sealed, authKey } });
  return code;
}

export const removeRecoveryCode = (authKey) =>
  api('/keys/recovery', { method: 'DELETE', body: { authKey } });

// For a password change: the private key sealed for the new password, or undefined when the
// current password does not open it (nothing to carry over).
export async function resealForNewPassword(currentWrapKey, newWrapKey) {
  const key = await fetchKey();
  if (!key) return undefined;
  const { openSealed, sealBytes } = await crypto();
  const privateKey = await openSealed(key.sealedPrivateKey, currentWrapKey);
  return privateKey ? sealBytes(privateKey, newWrapKey) : undefined;
}
