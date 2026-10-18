// ============================================================
// File:        devProxy.spec.js
// Path:        client/e2e/devProxy.spec.js
// Project:     Seasonal Entertainment
// Description: The development path: the browser talks to the Vite dev server, which proxies
//              to the real server. State-changing requests must pass the CSRF origin check
//              there too: a guest posts in the chat, and a new account registers and logs in.
// ============================================================

import { expect, test } from '@playwright/test';
import { DEV_PROXY_URL } from './ports.js';

test.use({ baseURL: DEV_PROXY_URL });

test('through the Vite dev proxy: guest chat post, register and login work', async ({ page }) => {
  await page.goto('/chat');
  const text = `Hi everyone ${Date.now()}`;
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(
    page.getByRole('list', { name: 'Messages in General' }).getByText(text)
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  const name = `dev${Date.now().toString(36)}`;
  await page.goto('/register');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Email').fill(`${name}@example.org`);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByLabel(/at least 14 years old/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/login');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});
