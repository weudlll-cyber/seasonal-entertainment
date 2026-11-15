// ============================================================
// File:        adminUserRow.spec.js
// Path:        client/e2e/adminUserRow.spec.js
// Project:     Seasonal Entertainment
// Description: The admin users list's row controls line up (UserRow.jsx): at desktop and phone
//              width "Reset password" (Password column) and "Delete" (Account column) sit at the
//              same height in the same 44px target, and with the reset form open the form and
//              "Delete" still start on one line and the form's fields and "Set" are shown.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { newAccountData } from './accountKeys.js';
import { ADMIN_STATE } from './adminState.js';

for (const [width, height] of [
  [1280, 800],
  [390, 844],
]) {
  test(`the users list at ${width} px: Reset password and Delete line up`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    // A member of its own, registered from an empty cookie jar (as admin.spec.js does), so the
    // search shows exactly one row.
    const other = await newRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL },
      storageState: { cookies: [], origins: [] },
    });
    const member = `row${width}${Date.now().toString(36)}`;
    await other.post('/api/auth/register', {
      data: await newAccountData(member, 'correct-horse-1'),
    });
    await other.dispose();

    const context = await browser.newContext({
      storageState: ADMIN_STATE,
      viewport: { width, height },
    });
    const page = await context.newPage();
    await page.goto('/admin');
    await page.getByRole('searchbox').fill(member);
    const row = page.getByRole('row').filter({ hasText: member });
    // What the screen shows of the row: the page clipped to its height (a row wider than a
    // phone, scrolled sideways inside its table, does not picture as an element).
    const shoot = async (name) => {
      const box = await row.boundingBox();
      const clip = { x: 0, y: box.y, width, height: box.height };
      await page.screenshot({ path: testInfo.outputPath(name), clip });
    };
    const reset = row.getByRole('button', { name: 'Reset password' });
    const remove = row.getByRole('button', { name: `Delete account for ${member}` });
    await expect(reset).toBeVisible();
    // On a phone the table scrolls sideways (.table-wrap); bring the Account column into view.
    await remove.scrollIntoViewIfNeeded();
    // The pictures come before the checks, and the checks are soft (the run goes on to the
    // open form), so a failing run still shows every state.
    await shoot(`row-${width}.png`);
    const [a, b] = [await reset.boundingBox(), await remove.boundingBox()];
    expect.soft(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
    expect.soft(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect.soft(a.height).toBeGreaterThanOrEqual(44);

    await reset.click();
    const form = row.locator('form');
    await expect(row.getByLabel(`New password for ${member}`)).toBeVisible();
    await expect(row.getByRole('button', { name: 'Set' })).toBeVisible();
    await shoot(`row-${width}-reset.png`);
    const [f, d] = [await form.boundingBox(), await remove.locator('..').boundingBox()];
    expect(Math.abs(f.y - d.y)).toBeLessThanOrEqual(1);
    await context.close();
  });
}
