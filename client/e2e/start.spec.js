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
  const targets = await steps.evaluateAll((links) => links.map((l) => l.getAttribute('href')));
  expect(targets).toHaveLength(6);
  for (const target of targets) {
    await page.goto('/start');
    await page.getByRole('list', { name: 'Steps' }).locator(`a[href="${target}"]`).click();
    await expect(page, target).toHaveURL(new RegExp(`${target}$`));
    await expect(page.getByRole('heading', { level: 1 }).first(), target).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page not found' }), target).toHaveCount(0);
  }
});
