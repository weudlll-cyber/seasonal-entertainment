// ============================================================
// File:        layout.spec.js
// Path:        client/e2e/layout.spec.js
// Project:     Seasonal Entertainment
// Description: The app shell in a real browser (docs/DESIGN.md): at 1440 x 900, 1280 x 720 and
//              1920 x 1080 the window never scrolls on any main page and the sidebar is shown;
//              Home's boxes are never cut, and at the end of its scroll the last row clears the
//              floating chat button (replaced "Home fits without scrolling", 2026-10-21). At
//              390 x 844 (phone): no window
//              scroll, a top bar, and the navigation drawer opens and closes (close button,
//              Escape, following a link), with focus going in and back. The chat button shows
//              exactly on the pages that have no chat of their own (not /chat, not /admin); at
//              phone width its drawer opens full width and closes.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

// Signed in as the run's admin, so Account and Admin are reachable too.
test.use({ storageState: ADMIN_STATE });

// [name, path, has the chat button]: everywhere except /chat and the admin area.
const PAGES = [
  ['Home', '/', true],
  ['Games', '/games', true],
  ['Events', '/events', true],
  ['Info index', '/info', true],
  ['Chat', '/chat', false],
  ['Calls', '/calls', true],
  ['Account', '/account', true],
  ['Admin users', '/admin/users', false],
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
// Scrolled to the end: the lowest home box's bottom and the chat button's top, and any box whose
// own content (not its faint logo part, which overflows on purpose) reaches past its edge.
const homeEnd = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    main.scrollTo(0, main.scrollHeight);
    const boxes = [...document.querySelectorAll('.home__grid > *')];
    const cut = boxes.filter((box) => {
      const edge = box.getBoundingClientRect().bottom;
      return [...box.querySelectorAll('*')].some(
        (el) =>
          !el.closest('.home__wash') &&
          getComputedStyle(el).position !== 'absolute' &&
          el.getClientRects().length > 0 &&
          el.getBoundingClientRect().bottom > edge + 1
      );
    });
    return {
      lastBottom: Math.max(...boxes.map((box) => box.getBoundingClientRect().bottom)),
      launcherTop: document.querySelector('.chat-launcher').getBoundingClientRect().top,
      cut: cut.map((box) => box.getAttribute('aria-label') ?? box.className),
    };
  });

for (const [width, height] of DESKTOP) {
  test.describe(`${width} x ${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const [name, path, chatButton] of PAGES) {
      test(`${name}: no window scroll, sidebar shown, chat button ${chatButton ? 'shown' : 'not shown'}`, async ({
        page,
      }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await windowFits(page)).toBe(true);
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
        await expect(page.getByRole('button', { name: /^Chat(:|$)/ })).toHaveCount(
          chatButton ? 1 : 0
        );
        if (chatButton)
          await expect(page.getByRole('button', { name: /^Chat(:|$)/ })).toBeVisible();
      });
    }

    test('Home: no box cut, and its end clears the chat button', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('region', { name: 'Up next' }).getByRole('link')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const end = await homeEnd(page);
      expect(end.cut).toEqual([]);
      expect(end.lastBottom).toBeLessThanOrEqual(end.launcherTop);
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

  test('the chat drawer opens full width and closes', async ({ page }) => {
    await page.goto('/games');
    const button = page.getByRole('button', { name: /^Chat(:|$)/ });
    await button.click();
    const drawer = page.getByRole('dialog', { name: 'Chat' });
    await expect(drawer).toBeVisible();
    expect((await drawer.boundingBox()).width).toBe(390);
    expect(await windowFits(page)).toBe(true);
    await drawer.getByRole('button', { name: 'Close chat' }).click();
    await expect(drawer).toBeHidden();
    await expect(button).toBeFocused();
  });
});
