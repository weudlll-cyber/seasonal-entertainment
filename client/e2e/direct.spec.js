// ============================================================
// File:        direct.spec.js
// Path:        client/e2e/direct.spec.js
// Project:     Seasonal Entertainment
// Description: End-to-end encrypted direct messages in real browsers (docs/CHAT.md): one
//              member opens "Send private message" from another's name in a room and sends a
//              secret canary; the other reads it, decrypted in their browser, live. The canary
//              is in no request or WebSocket frame of either browser and in no row of the run's
//              database. (No log line either: server/test/direct.test.js.)
// ============================================================

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { MEMBER_PASSWORD } from './members.js';
import { recordRequests } from './requestLog.js';

async function memberPage(browser, username) {
  const page = await (await browser.newContext()).newPage();
  const requests = recordRequests(page);
  await page.goto('/login');
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(username);
  await main.getByLabel('Password').fill(MEMBER_PASSWORD);
  await main.getByRole('button', { name: 'Log in' }).click();
  // First login: the key pair is made; the recovery code is not part of this test.
  await page
    .getByRole('dialog', { name: 'Protect your private messages' })
    .getByRole('button', { name: 'Skip' })
    .click();
  return { page, requests };
}

const databaseText = () => {
  const db = new Database(path.join(process.env.SE_E2E_DIR, 'e2e.db'), { readonly: true });
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .flatMap(({ name }) => db.prepare(`SELECT * FROM ${name}`).all())
      .map((row) => JSON.stringify(row))
      .join('\n');
  } finally {
    db.close();
  }
};

test('a private message is readable only in the two browsers', async ({ browser }) => {
  const canary = `secret-canary-${randomBytes(6).toString('hex')}`;
  const recipient = await memberPage(browser, 'dmrecip');
  const sender = await memberPage(browser, 'dmsender');

  // The recipient writes in General, so the sender has a name to click.
  await recipient.page.goto('/chat');
  const hello = `hello from dmrecip ${Date.now()}`;
  await recipient.page.getByLabel('Message', { exact: true }).fill(hello);
  await recipient.page.getByRole('button', { name: 'Send' }).click();
  await recipient.page.getByRole('tab', { name: 'Direct' }).click();
  await expect(
    recipient.page
      .getByRole('list', { name: 'Private conversations' })
      .or(recipient.page.getByText('No private conversations yet.', { exact: false }))
  ).toBeVisible();

  await sender.page.goto('/chat');
  const rooms = sender.page.getByRole('list', { name: 'Messages in General' });
  await rooms
    .getByRole('listitem')
    .filter({ hasText: hello })
    .getByRole('button', { name: 'dmrecip' })
    .click();
  await sender.page.getByRole('menuitem', { name: 'Send private message' }).click();
  const conversation = sender.page.getByRole('list', { name: 'Private messages with dmrecip' });
  await expect(conversation).toBeVisible();
  await sender.page.getByLabel('Message', { exact: true }).fill(canary);
  await sender.page.getByRole('button', { name: 'Send' }).click();
  await expect(conversation.getByText(canary)).toBeVisible();

  // The recipient's list shows the conversation (live), unread; opening it decrypts it.
  const row = recipient.page.getByRole('button', { name: /dmsender/ });
  await expect(row.getByRole('img', { name: 'unread messages' })).toBeVisible();
  await row.click();
  await expect(
    recipient.page.getByRole('list', { name: 'Private messages with dmsender' }).getByText(canary)
  ).toBeVisible();

  for (const side of [sender, recipient]) expect(side.requests.text()).not.toContain(canary);
  const stored = databaseText();
  expect(stored).toContain('"ciphertext"'); // the scan sees the direct messages
  expect(stored).not.toContain(canary);
});
