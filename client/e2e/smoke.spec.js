// ============================================================
// File:        smoke.spec.js
// Path:        client/e2e/smoke.spec.js
// Project:     Seasonal Entertainment
// Description: Browser smoke tests against the production server: the landing page opens
//              with title, loaded logo and no console errors (a Content-Security-Policy
//              violation would show up as one), and a deep link reaches the client's router.
// ============================================================

import { expect, test } from '@playwright/test';

test('landing page opens with title, a loaded logo and no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle('Seasonal Entertainment');

  const logo = page.getByAltText('Seasonal Entertainment logo');
  await expect(logo).toBeVisible();
  // naturalWidth is 0 when the image request failed or the file is not a decodable image.
  await expect
    .poll(() => logo.evaluate((img) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('a deep link is answered by the client router (404 page inside the layout)', async ({
  page,
}) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seasonal Entertainment');
});
