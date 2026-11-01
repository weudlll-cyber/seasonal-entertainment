// ============================================================
// File:        updates.spec.js
// Path:        client/e2e/updates.spec.js
// Project:     Seasonal Entertainment
// Description: A page open while the site is updated (docs/DEPLOYMENT.md, "Updating"), in the
//              production build: the "new version" notice once /api/health reports another
//              commit (the browser's clock is fast-forwarded past the check interval, and the
//              answer is changed in this page only), none for the same commit; a page part whose
//              file is gone reloads the page once and then loads, and one that stays gone shows
//              its error with a Reload button inside the shell.
// ============================================================

import { expect, test } from '@playwright/test';

const NOTICE = 'A new version of this site is available.';
const ERROR = 'This part of the page could not be loaded.';
// The start page's chunk (App.jsx loads it on first use); Vite names it after the file.
const START_CHUNK = '**/assets/StartPage-*.js';

const notice = (page) => page.getByRole('status').filter({ hasText: NOTICE });

test('another commit on the server: the notice, and Reload loads the page again', async ({
  page,
}) => {
  await page.clock.install();
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { ok: true, version: '0.1.0', commit: '000000000000' } })
  );
  await page.goto('/games');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await page.clock.fastForward('05:00');
  await expect(notice(page)).toBeVisible();
  const reload = page.getByRole('button', { name: 'Reload' });
  await reload.focus();
  await expect(reload).toBeFocused(); // reachable by keyboard
  await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

test('the same commit as the build: no notice', async ({ page }) => {
  await page.clock.install();
  const checked = page.waitForResponse('**/api/health');
  await page.goto('/games');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.clock.fastForward('05:00');
  await checked;
  await expect(notice(page)).toHaveCount(0);
});

// Counts the page's document loads (the first one and every reload); a link followed inside the
// app is no document load.
function countDocumentLoads(page) {
  const count = { loads: 0 };
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) count.loads++;
  });
  return count;
}

test('a page part whose file is gone reloads the page once and then loads', async ({ page }) => {
  const documents = countDocumentLoads(page);
  // Gone for the page that was open; the reloaded page gets the file (Vite asks for it twice:
  // a modulepreload link and the import).
  await page.route(START_CHUNK, (route) =>
    documents.loads < 2 ? route.fulfill({ status: 404, body: 'gone' }) : route.continue()
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Start here' })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Start here');
  await expect(page).toHaveURL(/\/start$/);
  expect(documents.loads).toBe(2); // reloaded once
  await expect(page.getByText(ERROR)).toHaveCount(0);
});

test('a page part that stays gone: its error with a Reload button, the shell stays', async ({
  page,
}) => {
  const documents = countDocumentLoads(page);
  await page.route(START_CHUNK, (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto('/start');
  await expect(page.getByRole('alert')).toHaveText(new RegExp(ERROR));
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  expect(documents.loads).toBe(2); // the first load and the one reload, no loop
});
