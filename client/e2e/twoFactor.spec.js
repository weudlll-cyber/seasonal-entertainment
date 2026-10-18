// ============================================================
// File:        twoFactor.spec.js
// Path:        client/e2e/twoFactor.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server: turn 2FA on (the QR image must load
//              under the CSP), log out, and log in again with password plus code. The codes
//              are computed with the server's own TOTP module from the secret on screen.
// ============================================================

import { expect, test } from '@playwright/test';
import { codeForStep, stepAt } from '../../server/src/twofa/totp.js';

test('turn on 2FA and log in with a code', async ({ page }) => {
  const name = `tfa${Date.now().toString(36)}`;
  await page.goto('/register');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Email').fill(`${name}@example.org`);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByLabel(/at least 14 years old/).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  // Wait for the account page: the register page has a "Password" field too. Exact: the
  // account page also has "Current password" and "New password".
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-1');
  await page.getByRole('button', { name: 'Set up two-factor authentication' }).click();
  const qr = page.getByAltText('QR code for your authenticator app');
  await expect
    .poll(() => qr.evaluate((img) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  const secret = (await page.locator('code').first().textContent()).trim();
  const step = stepAt(Date.now());
  await page.getByLabel('Code from the app').fill(codeForStep(secret, step));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByText(/will not be shown again/)).toBeVisible();
  await page.getByRole('button', { name: 'I have saved the codes' }).click();
  await expect(page.getByText('Two-factor authentication is on.')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.goto('/login');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill('correct-horse-1');
  await page.getByRole('button', { name: 'Log in' }).click();
  // The next step's code: the one used to enable is already spent (replay guard).
  await page.getByLabel('Authentication code').fill(codeForStep(secret, step + 1));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});
