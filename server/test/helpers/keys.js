// ============================================================
// File:        keys.js
// Path:        server/test/helpers/keys.js
// Project:     Seasonal Entertainment
// Description: Key test helpers (keys/, docs/CHAT.md): a registered member with a key pair made
//              the way the browser makes it, a recovery code sealed for a private key, and the
//              member's current key as the API returns it.
// ============================================================

import {
  deriveRecoveryKey,
  newRecoveryCode,
  newSalt,
  sealBytes,
} from '@seasonal-entertainment/shared/crypto.js';
import { expect } from 'vitest';
import { browserKeyPair } from './accountKeys.js';
import { registerUser } from './testApp.js';

export const PASSWORD = 'correct-horse-1';

export const currentKeyOf = async (agent) => (await agent.get('/api/keys/me')).body.key;

// Registers `name` and gives them a key pair the way their browser would.
export async function memberWithKey(t, name = 'anna') {
  const { agent, user } = await registerUser(t, name, PASSWORD);
  const pair = await browserKeyPair(PASSWORD);
  const res = await agent.post('/api/keys').send(pair);
  expect(res.status).toBe(201);
  return { agent, user, pair, keyId: res.body.keyId };
}

// Seals the private key with a new recovery code, as the account page does; returns the code.
export async function addRecovery(agent, privateKey) {
  const code = await newRecoveryCode();
  const salt = await newSalt();
  const sealed = await sealBytes(privateKey, await deriveRecoveryKey(code, salt));
  expect((await agent.put('/api/keys/recovery').send({ salt, sealed })).status).toBe(200);
  return code;
}
