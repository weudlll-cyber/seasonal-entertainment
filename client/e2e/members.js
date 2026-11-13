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
//              a first login and a later one alike, also when two browsers log the same member
//              in at once (--repeat-each runs a file's repeats in parallel workers).
//              E2E_DATABASE: the run's database, for specs that look into it.
//              addMember() adds one more the same way, for a spec that uses one up (deletes it);
//              postInChat() writes a message as that member, stored() says what the database
//              still holds of the account (its row, its room messages).
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
  'stepwhale',
  'stepnone',
  'picsender',
  'picrecip',
  'pollvoter',
  'pollhome',
  'callpoll',
  'pollroom',
  'pollphone',
  'profileone',
  'profiletwo',
  'narrowsend',
  'narrowrecip',
  'narrowposter',
  'pushmember',
  'accountphone',
];

async function insertMember(db, username) {
  const salt = await newSalt();
  const { authKey } = await deriveAccountKeys(MEMBER_PASSWORD, salt);
  db.prepare(
    'INSERT INTO users (username, email, password_hash, kdf_salt) VALUES (?, ?, ?, ?)'
  ).run(username, `${username}@example.org`, await hashPassword(authKey, 4), salt);
}

export async function seedMembers(databasePath) {
  const db = new Database(databasePath);
  try {
    for (const username of MEMBERS) await insertMember(db, username);
  } finally {
    db.close();
  }
}

export async function addMember(username) {
  const db = new Database(E2E_DATABASE);
  try {
    await insertMember(db, username);
  } finally {
    db.close();
  }
}

// A seeded member logged in, in a browser of its own. The recovery-code offer comes only in
// the browser that made the member's key pair, and is skipped there. Which browser that is
// shows in its own POST /api/keys answer, known before the login page leaves /login (it opens
// or makes the key first, LoginPage.jsx): asking the database before the login instead let two
// browsers logging in at once both wait for the offer (seen with --repeat-each, 2026-11-03).
// Returns { page, requests } (requestLog.js).
export async function memberPage(browser, username) {
  const page = await (await browser.newContext()).newPage();
  const requests = recordRequests(page);
  let madeKeyPair = false;
  page.on('response', (response) => {
    if (
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/keys' &&
      response.ok()
    )
      madeKeyPair = true;
  });
  await page.goto('/login');
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(username);
  await main.getByLabel('Password').fill(MEMBER_PASSWORD);
  await main.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  if (madeKeyPair) {
    const offer = page.getByRole('dialog', { name: 'Protect your private messages' });
    await offer.getByRole('button', { name: 'Skip' }).click();
    await expect(offer).toBeHidden();
  }
  return { page, requests };
}

// Posts a message in the chat page as the page's member and waits until it shows.
export async function postInChat(page) {
  await page.goto('/chat');
  const text = `before deletion ${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: text })).toBeVisible();
}

// What the run's database holds about the account: its row and its room messages.
export function stored(username) {
  const db = new Database(E2E_DATABASE, { readonly: true });
  try {
    return {
      accounts: db.prepare('SELECT COUNT(*) AS n FROM users WHERE username = ?').get(username).n,
      messages: db
        .prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE author_name = ?')
        .get(username).n,
    };
  } finally {
    db.close();
  }
}
