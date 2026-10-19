// ============================================================
// File:        passwordWorker.spec.js
// Path:        client/e2e/passwordWorker.spec.js
// Project:     Seasonal Entertainment
// Description: In a real browser, under the server's real Content-Security-Policy, a login
//              derives the password's keys in the password-hashing worker (its own
//              same-origin file from /assets), the page reports no CSP violation, and the login
//              works. Guards that the worker is not silently replaced by the main-thread
//              fallback (client/src/session/passwordHashing.js).
// ============================================================

import { expect, test } from '@playwright/test';
import { MEMBER_PASSWORD } from './members.js';

test('the login derives its keys in a same-origin worker, within the CSP', async ({ page }) => {
  const workers = [];
  page.on('worker', (worker) => workers.push(new URL(worker.url())));
  await page.goto('/login');
  // Collected in the page itself: every CSP violation from now on.
  await page.evaluate(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`)
    );
  });
  const main = page.getByRole('main');
  await main.getByLabel('Username').fill('hashworker');
  await main.getByLabel('Password').fill(MEMBER_PASSWORD);
  await main.getByRole('button', { name: 'Log in' }).click();
  await page
    .getByRole('dialog', { name: 'Protect your private messages' })
    .getByRole('button', { name: 'Skip' })
    .click();
  await expect(page.getByRole('banner').getByRole('link', { name: /^hashworker/ })).toBeVisible();

  const origin = new URL(page.url()).origin;
  const hashing = workers.filter((url) => /passwordHashing\.worker/.test(url.pathname));
  expect(hashing).toHaveLength(1);
  expect(hashing[0].origin).toBe(origin);
  expect(hashing[0].pathname).toMatch(/^\/assets\//);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
});
