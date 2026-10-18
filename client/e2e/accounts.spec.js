// ============================================================
// File:        accounts.spec.js
// Path:        client/e2e/accounts.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server: register, see the account, change the
//              password, log out, log in again with the new one; neither password appears in
//              any request (docs/AUTH.md, "Login key split"). The chat drawer stays open across the login and the logout: its
//              panel writes as the member after logging in and is a guest's again after
//              logging out, without leaving the page. Runs on the e2e run's own temporary
//              database; the registration limit per IP is why this spec carries the drawer
//              check instead of registering an account of its own.
// ============================================================

import { expect, test } from '@playwright/test';
import { SERVER_PORT } from './ports.js';
import { recordRequests } from './requestLog.js';

const SERVER = `http://127.0.0.1:${SERVER_PORT}`;

test('register, log out and log in again', async ({ page }) => {
  const name = `e2e${Date.now().toString(36)}`;
  const requests = recordRequests(page);
  // What the chat socket receives: the server's "subscribed" answers.
  const received = [];
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => received.push(String(frame.payload)))
  );
  await page.goto('/register');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Email').fill(`${name}@example.org`);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByLabel(/at least 14 years old/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  // The new key pair's recovery-code offer (keys.spec.js covers it).
  await page
    .getByRole('dialog', { name: 'Protect your private messages' })
    .getByRole('button', { name: 'Skip' })
    .click();

  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  // The sidebar's account card shows the new account.
  const shell = page.getByRole('banner');
  await expect(shell.getByRole('link', { name: `${name} (Member), your account` })).toBeVisible();

  await page.getByLabel('Current password').fill('correct-horse-1');
  await page.getByLabel('New password').fill('battery-staple-2');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(shell.getByRole('link', { name: 'Log in' })).toBeVisible();

  // A guest opens the chat drawer; it stays open while they log in.
  await page.getByRole('button', { name: /^Chat(:|$)/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Chat' });
  await expect(drawer.getByText(/You are a guest/)).toBeVisible();

  await shell.getByRole('link', { name: 'Log in' }).click();
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill(name);
  await main.getByLabel('Password').fill('battery-staple-2');
  await main.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();

  // The same panel now writes as the member.
  await expect(drawer.getByText(/You are a guest/)).toHaveCount(0);
  const text = `as member ${Date.now()}`;
  await drawer.getByLabel('Message', { exact: true }).fill(text);
  await drawer.getByRole('button', { name: 'Send' }).click();
  const sent = drawer.getByRole('listitem').filter({ hasText: text });
  await expect(sent.getByText(name, { exact: true })).toBeVisible();
  await expect(sent.getByText('Guest', { exact: true })).toHaveCount(0);
  // Live events of a members-only room reach it: the connection is the member's now (the
  // server refuses a guest's socket there). Posted beside the panel, so only the push shows it.
  await drawer.getByRole('button', { name: 'Room: General' }).click();
  await page.getByRole('option', { name: /Seasonal Race/ }).click();
  await expect(drawer.getByRole('list', { name: 'Messages in Seasonal Race' })).toBeVisible();
  // Only once the server accepted the subscription (a guest's socket is refused there) can a
  // push arrive; posting earlier would race the new connection.
  await expect
    .poll(() => received.some((p) => p.includes('"subscribed"') && p.includes('seasonal-race')))
    .toBe(true);
  const live = `live ${Date.now()}`;
  const posted = await page.request.post('/api/chat/rooms/seasonal-race/messages', {
    data: { body: live },
    headers: { Origin: SERVER },
  });
  expect(posted.status()).toBe(201);
  await expect(drawer.getByText(live)).toBeVisible();

  await main.getByRole('button', { name: 'Log out' }).click();
  await expect(drawer.getByText(/You are a guest/)).toBeVisible();
  // Register, password change and login: neither typed password was ever sent.
  expect(requests.text()).toContain('/api/auth/password');
  expect(requests.text()).not.toMatch(/correct-horse-1|battery-staple-2/);
});
