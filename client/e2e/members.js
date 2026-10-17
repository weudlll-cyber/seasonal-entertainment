// ============================================================
// File:        members.js
// Path:        client/e2e/members.js
// Project:     Seasonal Entertainment
// Description: Members for the browser tests, written straight into the run's own temporary
//              database by the global setup, the way registration stores them (a random salt,
//              bcrypt of the auth key derived with the project's crypto helper). The specs
//              would otherwise need more registrations than the per-IP limit allows. They have
//              no key pair yet: their first login in a browser makes one.
// ============================================================

import Database from 'better-sqlite3';
import { deriveAccountKeys, newSalt } from '@seasonal-entertainment/shared/crypto.js';
import { hashPassword } from '../../server/src/accounts/passwords.js';

export const MEMBER_PASSWORD = 'member-horse-1';
// One account per spec that needs its own, so specs running in parallel never share one.
export const MEMBERS = ['keyskip', 'keycode'];

export async function seedMembers(databasePath) {
  const db = new Database(databasePath);
  try {
    for (const username of MEMBERS) {
      const salt = await newSalt();
      const { authKey } = await deriveAccountKeys(MEMBER_PASSWORD, salt);
      db.prepare(
        'INSERT INTO users (username, email, password_hash, kdf_salt) VALUES (?, ?, ?, ?)'
      ).run(username, `${username}@example.org`, await hashPassword(authKey, 4), salt);
    }
  } finally {
    db.close();
  }
}
