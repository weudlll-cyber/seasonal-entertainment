// ============================================================
// File:        passwords.js
// Path:        server/src/accounts/passwords.js
// Project:     Seasonal Entertainment
// Description: Password hashing with bcrypt (cost from config, 12 by default as in the race
//              game). Verifying for an unknown user still costs one comparison, so response
//              time does not reveal which usernames exist.
// ============================================================

import bcrypt from 'bcrypt';

let dummyHash = null;

export function hashPassword(password, cost) {
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password, hash, cost) {
  if (typeof password !== 'string') return false;
  if (!hash) {
    dummyHash ??= await bcrypt.hash('not-a-real-password', cost);
    await bcrypt.compare(password, dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
