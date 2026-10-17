// ============================================================
// File:        admin.spec.js
// Path:        client/e2e/admin.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server: the run's admin is created via the real
//              bootstrap route and turns on 2FA; in /admin it changes a member's role, and the
//              audit log shows the change.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { codeForStep, stepAt } from '../../server/src/twofa/totp.js';

test('an admin changes a role and finds it in the audit log', async ({ page, baseURL }) => {
  const headers = { Origin: baseURL };
  // page.request shares the browser's cookies: the bootstrap logs this browser in.
  const boot = await page.request.post('/api/auth/bootstrap', {
    headers: { ...headers, 'x-bootstrap-token': 'e2e-bootstrap-token' },
    data: { username: 'e2eadmin', email: 'e2eadmin@example.org', password: 'correct-horse-1' },
  });
  expect(boot.status()).toBe(201);
  const setup = await (await page.request.post('/api/2fa/setup', { headers })).json();
  const code = codeForStep(setup.secret, stepAt(Date.now()));
  expect((await page.request.post('/api/2fa/enable', { headers, data: { code } })).status()).toBe(
    200
  );

  // A member to work on, registered from a separate cookie jar.
  const other = await newRequest.newContext({ baseURL, extraHTTPHeaders: headers });
  const member = `mem${Date.now().toString(36)}`;
  await other.post('/api/auth/register', {
    data: {
      username: member,
      email: `${member}@example.org`,
      password: 'correct-horse-1',
      ageConfirmed: true,
    },
  });
  await other.dispose();

  await page.goto('/admin');
  await page.getByRole('searchbox').fill(member);
  await page.getByLabel(`Role for ${member}`).selectOption('organiser');
  await expect(page.getByText('Saved.')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Admin' })
    .getByRole('link', { name: 'Audit log' })
    .click();
  const newest = page.getByRole('row').nth(1);
  await expect(newest).toContainText('user.role');
  await expect(newest).toContainText('e2eadmin');
  await expect(newest).toContainText('{"role":"organiser"}');
});
