// ============================================================
// File:        accounts.spec.js
// Path:        client/e2e/accounts.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server: register, see the account, log out,
//              log in again. Runs on the e2e run's own temporary database.
// ============================================================

import { expect, test } from '@playwright/test';

test('register, log out and log in again', async ({ page }) => {
  const name = `e2e${Date.now().toString(36)}`;
  await page.goto('/register');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Email').fill(`${name}@example.org`);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByLabel(/at least 14 years old/).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();

  await nav.getByRole('link', { name: 'Login' }).click();
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});
