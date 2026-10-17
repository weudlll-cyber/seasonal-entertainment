// ============================================================
// File:        accountKeys.js
// Path:        server/test/helpers/accountKeys.js
// Project:     Seasonal Entertainment
// Description: Test helper: what a browser sends instead of a password (docs/AUTH.md, "Login
//              key split"), made with the project's one crypto helper (shared/crypto.js).
//              A real browser picks a random salt per account; tests use one fixed salt (and
//              another for password resets), so a whole run needs one Argon2id derivation
//              per password, not one per account: each costs about 64 MiB and noticeable time.
// ============================================================

import { deriveAccountKeys } from '@seasonal-entertainment/shared/crypto.js';

export const TEST_SALT = 'dGVzdC1zYWx0LTE2Ynl0ZQ==';
const RESET_SALT = 'cmVzZXQtc2FsdC0xNmJ5dA==';
const derived = new Map();

// { salt, authKey, wrapKey } for this password (and salt).
export async function keysFor(password, salt = TEST_SALT) {
  const key = `${password}
${salt}`;
  if (!derived.has(key)) derived.set(key, deriveAccountKeys(password, salt));
  return { salt, ...(await derived.get(key)) };
}

// The registration body a browser sends.
export async function registration(username, password, extra = {}) {
  const { salt, authKey } = await keysFor(password);
  return {
    username,
    email: `${username}@example.org`,
    salt,
    authKey,
    ageConfirmed: true,
    ...extra,
  };
}

// Logs an agent in the way the browser does (the account's salt, the auth key derived with it).
export async function logIn(agent, username, password) {
  const { authKey } = await keysFor(password);
  return agent.post('/api/auth/login').send({ username, authKey });
}

// "The current password" for routes that ask for it again (2FA setup and disable).
export async function proof(password) {
  const { authKey } = await keysFor(password);
  return { authKey };
}

// A new password as an admin's browser sends it for a reset: a new salt (not the one the
// account was registered with) and the auth key derived with it.
export async function newPasswordBody(password) {
  const { salt, authKey } = await keysFor(password, RESET_SALT);
  return { salt, authKey };
}
