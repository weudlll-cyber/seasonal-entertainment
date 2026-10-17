// ============================================================
// File:        layout.spec.js
// Path:        client/e2e/layout.spec.js
// Project:     Seasonal Entertainment
// Description: The app shell in a real browser (docs/DESIGN.md): at 1440 x 900, 1280 x 720 and
//              1920 x 1080 the window never scrolls on any main page and the sidebar is shown;
//              Home fits its main column without scrolling. At 390 x 844 (phone): no window
//              scroll, a top bar, and the navigation drawer opens and closes (close button,
//              Escape, following a link), with focus going in and back.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

// Signed in as the run's admin, so Account and Admin are reachable too.
test.use({ storageState: ADMIN_STATE });

const PAGES = [
  ['Home', '/'],
  ['Games', '/games'],
  ['Events', '/events'],
  ['Info index', '/info'],
  ['Chat', '/chat'],
  ['Account', '/account'],
  ['Admin users', '/admin/users'],
];
const DESKTOP = [
  [1440, 900],
  [1280, 720],
  [1920, 1080],
];

// The window does not scroll, and nothing is cut off at the window's edge either: html, body
// and #root clip overflow, so their content must fit too (only the main column scrolls).
const windowFits = (page) =>
  page.evaluate(() =>
    [document.scrollingElement, document.body, document.getElementById('root')].every(
      (element) => element.scrollHeight <= window.innerHeight
    )
  );
const mainFits = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    return main.scrollHeight <= main.clientHeight;
  });

for (const [width, height] of DESKTOP) {
  test.describe(`${width} x ${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const [name, path] of PAGES) {
      test(`${name}: no window scroll, sidebar shown`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await windowFits(page)).toBe(true);
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
      });
    }

    test('Home fits its main column without scrolling', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Up next' }).getByRole('link')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await mainFits(page)).toBe(true);
    });
  });
}

test.describe('390 x 844 (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no window scroll; the navigation drawer opens and closes', async ({ page }) => {
    for (const [, path] of PAGES) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await windowFits(page), path).toBe(true);
    }
    await page.goto('/games');
    const menu = page.getByRole('button', { name: 'Open menu' });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeHidden();

    await menu.click();
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await page.getByRole('button', { name: 'Close menu' }).click();
    await expect(nav).toBeHidden();

    await menu.click();
    await nav.getByRole('link', { name: 'Events' }).click();
    await expect(page.getByRole('heading', { name: 'Events', level: 1 })).toBeVisible();
    await expect(nav).toBeHidden();
  });
});
