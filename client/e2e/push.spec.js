// ============================================================
// File:        push.spec.js
// Path:        client/e2e/push.spec.js
// Project:     Seasonal Entertainment
// Description: The installable site and its web push in a real browser (docs/CALLS.md, "Push
//              when a call starts"; docs/DESIGN.md, "Installable site"): every page links the
//              web app manifest, which the server hands out with its icons; the service worker
//              registers for the whole site and is checked on every visit, not cached for long;
//              a member's account page has "When a call starts" (the run's server has push
//              keys), a guest never reaches it.
// ============================================================

import { expect, test } from '@playwright/test';
import { memberPage } from './members.js';

test('the manifest is linked and served with its icons', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const manifest = await (await request.get(href)).json();
  expect(manifest).toMatchObject({ name: 'Seasonal Entertainment', start_url: '/' });
  for (const icon of manifest.icons) {
    const answer = await request.get(icon.src);
    expect(answer.status(), icon.src).toBe(200);
    expect(answer.headers()['content-type']).toBe('image/png');
  }
});

test('the service worker registers for the whole site', async ({ page, request }) => {
  await page.goto('/');
  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, script: registration.active?.scriptURL };
  });
  expect(new URL(registered.scope).pathname).toBe('/');
  expect(new URL(registered.script).pathname).toBe('/sw.js');
  // A changed worker must reach browsers: never cached as immutable.
  expect((await request.get('/sw.js')).headers()['cache-control']).not.toContain('immutable');
});

test('a member has "When a call starts"; a guest does not reach it', async ({ browser, page }) => {
  const { page: member } = await memberPage(browser, 'pushmember');
  await member.goto('/account#notifications');
  const toggle = member.getByRole('switch', { name: /When a call starts/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();

  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('switch', { name: /When a call starts/ })).toHaveCount(0);
});
