// ============================================================
// File:        accountDesktop.spec.js
// Path:        client/e2e/accountDesktop.spec.js
// Project:     Seasonal Entertainment
// Description: The account page on a desktop (decided 2026-11-13; docs/DESIGN.md "Account
//              page"): with all six sections closed and the chat drawer closed, it fits the
//              window without a vertical scrollbar, the home page's yardstick, at 1280 x 720,
//              1440 x 900, 1915 x 913 and 1920 x 1080, light and dark, for a member and for an
//              admin (the longest status lines: two-factor on, Discord). Every status line is
//              known before measuring, so the page is at its tallest.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { memberPage } from './members.js';

const SIZES = [
  [1280, 720],
  [1440, 900],
  [1915, 913],
  [1920, 1080],
];

// How far the main column (the one part of the shell that scrolls) overflows, in px.
const overflow = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('.shell__main');
    return main.scrollHeight - main.clientHeight;
  });

const pages = {
  member: async (browser) => (await memberPage(browser, 'accountdesk')).page,
  admin: async (browser) => (await browser.newContext({ storageState: ADMIN_STATE })).newPage(),
};

for (const [who, open] of Object.entries(pages)) {
  test(`the ${who}'s account page fits a desktop window with every section closed`, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await open(browser);
    await page.goto('/account');
    // At its tallest: the sections' own loads have told their status lines.
    await expect(page.locator('#profile .disclosure__status')).toBeVisible();
    await expect(page.locator('#private-messages .disclosure__status')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.locator('.disclosure__button[aria-expanded="true"]').count()).toBe(0);
    for (const [width, height] of SIZES) {
      for (const colorScheme of ['light', 'dark']) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme });
        // Soft: one run names every size that does not fit.
        expect
          .soft(await overflow(page), `${who}, ${width} x ${height}, ${colorScheme}`)
          .toBeLessThanOrEqual(0);
      }
    }
  });
}
