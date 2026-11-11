// ============================================================
// File:        start.spec.js
// Path:        client/e2e/start.spec.js
// Project:     Seasonal Entertainment
// Description: The Start here page against the real server: every step's button leads to a
//              page that exists (the info pages are seeded published), never to "Page not
//              found"; the sidebar's "Start here" (below Home) opens it.
// ============================================================

import { expect, test } from '@playwright/test';

test('every step of Start here leads to an existing page', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Start here' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Start here' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'Steps' }).getByRole('link');
  await expect(steps).toHaveCount(6);
  // By position: the call step leads to /calls, or to /calls/<id> once a call is planned, and
  // another spec may plan one meanwhile (they share one server), so it may change under the
  // click. Either is an existing page.
  for (let index = 0; index < 6; index += 1) {
    await page.goto('/start');
    const link = steps.nth(index);
    const target = await link.getAttribute('href');
    await link.click();
    const address = target.startsWith('/calls') ? /\/calls(\/\d+)?$/ : new RegExp(`${target}$`);
    await expect(page, target).toHaveURL(address);
    await expect(page.getByRole('heading', { level: 1 }).first(), target).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page not found' }), target).toHaveCount(0);
  }
});
