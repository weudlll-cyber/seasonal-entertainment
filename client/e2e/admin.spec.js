// ============================================================
// File:        admin.spec.js
// Path:        client/e2e/admin.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server, as the run's admin (globalSetup.js): in
//              /admin it changes a member's role, and the audit log shows the change.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { newAccountData } from './accountKeys.js';
import { ADMIN, ADMIN_STATE } from './adminState.js';

test.use({ storageState: ADMIN_STATE });

test('an admin changes a role and finds it in the audit log', async ({ page, baseURL }) => {
  // A member to work on, registered from a separate, EMPTY cookie jar. Without the explicit
  // empty storageState the context inherits test.use({ storageState }) above, the request
  // carries the admin's cookie, and registering replaces the admin's session.
  const other = await newRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
    storageState: { cookies: [], origins: [] },
  });
  const member = `mem${Date.now().toString(36)}`;
  await other.post('/api/auth/register', {
    data: await newAccountData(member, 'correct-horse-1'),
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
  // Other specs write audit entries in parallel, so find this change rather than the top row.
  const entry = page.getByRole('row').filter({ hasText: 'user.role' }).first();
  await expect(entry).toContainText(ADMIN.username);
  await expect(entry).toContainText('{"role":"organiser"}');
});
