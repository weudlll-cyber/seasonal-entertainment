// ============================================================
// File:        accountDelete.spec.js
// Path:        client/e2e/accountDelete.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server for "Delete my account" (docs/AUTH.md,
//              "Deleting an account"): a member writes in the chat, then deletes the account on
//              the account page with the password; the page is a guest's at home, the account
//              and its message are gone from the database, the name cannot log in again, and the
//              password never appears in any request. Uses a member of its own (addMember), as
//              this spec uses it up.
// ============================================================

import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { E2E_DATABASE, MEMBER_PASSWORD, addMember, memberPage } from './members.js';

// What the run's database holds about the account: its row and its room messages.
function stored(username) {
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

test('a member deletes their own account with the password', async ({ browser }) => {
  const name = `del${Date.now().toString(36)}`;
  await addMember(name);
  const { page, requests } = await memberPage(browser, name);

  // Something to delete: a message in the chat.
  await page.goto('/chat');
  const text = `before deletion ${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: text })).toBeVisible();
  expect(stored(name)).toEqual({ accounts: 1, messages: 1 });

  await page.goto('/account');
  const button = page.getByRole('button', { name: 'Delete my account' });
  const section = page.locator('form').filter({ has: button });
  await expect(page.getByText(/cannot be undone/)).toBeVisible();
  await section.getByLabel('Password').fill(MEMBER_PASSWORD);
  await section.getByRole('checkbox').check();
  await button.click();

  // Home, as a guest; nothing of the account is left.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible();
  expect(stored(name)).toEqual({ accounts: 0, messages: 0 });
  expect(requests.text()).not.toContain(MEMBER_PASSWORD);

  // The name logs in no more.
  await page.goto('/login');
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(name);
  await main.getByLabel('Password').fill(MEMBER_PASSWORD);
  await main.getByRole('button', { name: 'Log in' }).click();
  await expect(main.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
