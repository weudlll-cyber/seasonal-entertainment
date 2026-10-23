// ============================================================
// File:        members.js
// Path:        client/e2e/members.js
// Project:     Seasonal Entertainment
// Description: Members for the browser tests, written straight into the run's own temporary
//              database by the global setup, the way registration stores them (a random salt,
//              bcrypt of the auth key derived with the project's crypto helper). The specs
//              would otherwise need more registrations than the per-IP limit allows. They have
//              no key pair yet: their first login in a browser makes one. memberPage() logs one
//              in, in a browser of its own, and records what that browser sends; it works for
//              a first login and a later one alike (a spec run again in the same run, e.g.
//              --repeat-each). E2E_DATABASE: the run's database, for specs that look into it.
// ============================================================

import path from 'node:path';
import Database from 'better-sqlite3';
import { expect } from '@playwright/test';
import { deriveAccountKeys, newSalt } from '@seasonal-entertainment/shared/crypto.js';
import { hashPassword } from '../../server/src/accounts/passwords.js';
import { recordRequests } from './requestLog.js';

export const MEMBER_PASSWORD = 'member-horse-1';
export const E2E_DATABASE = path.join(process.env.SE_E2E_DIR, 'e2e.db');
// One account per spec that needs its own, so specs running in parallel never share one.
const MEMBERS = [
  'keyskip',
  'keycode',
  'dmsender',
  'dmrecip',
  'rpreporter',
  'rpwriter',
  'unreadreader',
  'unreadwriter',
  'callmember',
  'calllayout',
  'callfit1',
  'callfit2',
  'hashworker',
  'embedfan',
  'embedpal',
];

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

// Whether the member has a key pair already (made at their first login in a browser).
function hasKeyPair(username) {
  const db = new Database(E2E_DATABASE, { readonly: true });
  try {
    return Boolean(
      db
        .prepare('SELECT 1 FROM user_keys k JOIN users u ON u.id = k.user_id WHERE u.username = ?')
        .get(username)
    );
  } finally {
    db.close();
  }
}

// A seeded member logged in, in a browser of its own. The recovery-code offer comes only with
// the key pair, at the first login, and is skipped then; asked before, so a later login does
// not wait for an offer that never comes. Returns { page, requests } (requestLog.js).
export async function memberPage(browser, username) {
  const firstLogin = !hasKeyPair(username);
  const page = await (await browser.newContext()).newPage();
  const requests = recordRequests(page);
  await page.goto('/login');
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(username);
  await main.getByLabel('Password').fill(MEMBER_PASSWORD);
  await main.getByRole('button', { name: 'Log in' }).click();
  if (firstLogin) {
    const offer = page.getByRole('dialog', { name: 'Protect your private messages' });
    await offer.getByRole('button', { name: 'Skip' }).click();
    await expect(offer).toBeHidden();
  } else {
    await expect(page).not.toHaveURL(/\/login$/);
  }
  return { page, requests };
}
