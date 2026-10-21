// ============================================================
// File:        layout.spec.js
// Path:        client/e2e/layout.spec.js
// Project:     Seasonal Entertainment
// Description: The app shell in a real browser (docs/DESIGN.md): at 1440 x 900, 1280 x 720 and
//              1920 x 1080 the window never scrolls on any main page and the sidebar is shown;
//              Home, at its fullest (a planned call with a long title, in "Up next" and the Next
//              call box, 3 messages) and with no call (no Next call box, the fair-price box
//              wider), fits the window without scrolling, no box is cut and nothing in a box
//              lies under the floating chat button (owner decision 2026-10-17, confirmed
//              2026-10-21). At
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
// The home page as it is: whether its column scrolls, any box whose own content (not its faint
// logo part, which overflows on purpose) reaches past its edge, and anything a visitor sees in a
// box that lies under the floating chat button.
const homeState = (page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    const boxes = [...document.querySelectorAll('.home__grid > *')];
    const seen = (box) =>
      [...box.querySelectorAll('*')].filter(
        (el) =>
          !el.closest('.home__wash') &&
          getComputedStyle(el).position !== 'absolute' &&
          el.getClientRects().length > 0
      );
    const name = (box) => box.getAttribute('aria-label') ?? box.className;
    const launcher = document.querySelector('.chat-launcher').getBoundingClientRect();
    const under = (el) => {
      const b = el.getBoundingClientRect();
      return (
        b.right > launcher.left &&
        b.left < launcher.right &&
        b.bottom > launcher.top &&
        b.top < launcher.bottom
      );
    };
    return {
      scrolls: main.scrollHeight > main.clientHeight,
      // Cut: reaching past the box, or past any part inside it that clips (a list that hides
      // its overflow would otherwise cut a message without the box noticing).
      cut: boxes
        .filter((box) =>
          seen(box).some((el) => {
            const bottom = el.getBoundingClientRect().bottom;
            for (let up = el.parentElement; up && up !== box.parentElement; up = up.parentElement) {
              // A title clamped after its lines hides the rest on purpose (ellipsis).
              if (getComputedStyle(up).webkitLineClamp !== 'none') return false;
              const clips = getComputedStyle(up).overflowY !== 'visible' || up === box;
              if (clips && bottom > up.getBoundingClientRect().bottom + 1) return true;
            }
            return false;
          })
        )
        .map(name),
      underLauncher: boxes.flatMap((box) =>
        seen(box)
          .filter((el) => el.matches('a, button, p, h2, span, strong, li, img, time') && under(el))
          .map((el) => `${name(box)}: ${el.textContent.trim().slice(0, 30)}`)
      ),
    };
  });

// The fullest home, whatever other specs do meanwhile (they start their own calls): a planned
// call with a 58-character title and the longest date (with the year), first in "Up next" and
// in the Next call box with both of its buttons (as the run's admin), and 3 recent messages in
// General — answered here, as prices.spec.js does. withCall false: no live or planned call.
const CALL = {
  id: 999,
  title: 'Seasonal Tokens community call: the four seasons explained',
  status: 'scheduled',
  description: '',
  scheduledFor: '2000-01-01T19:00:00.000Z',
};
async function fullestHome(page, withCall) {
  await page.route('**/api/calls', (route) =>
    route.fulfill({
      json: {
        ok: true,
        configured: true,
        canManage: true,
        calls: { live: [], upcoming: withCall ? [CALL] : [], recent: [] },
        reminders: [],
      },
    })
  );
  const message = (id, body) => ({
    id,
    author: 'e2eadmin',
    body,
    kind: 'text',
    file: null,
    createdAt: new Date().toISOString(),
  });
  await page.route('**/api/chat/glimpse', (route) =>
    route.fulfill({
      json: {
        ok: true,
        online: 3,
        room: 'general',
        messages: [
          message(1, 'Battles start soon — who is in?'),
          message(2, 'Spring looks cheap again today.'),
          message(3, 'See you at the community call!'),
        ],
      },
    })
  );
}

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

    test('Home with a call fits without scrolling, no box cut, nothing under the chat button', async ({
      page,
    }) => {
      await fullestHome(page, true);
      await page.goto('/');
      await expect(
        page.getByRole('region', { name: 'Up next' }).getByRole('link', { name: CALL.title })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^Remind me of Seasonal Tokens/ })
      ).toBeVisible();
      await expect(page.getByText('See you at the community call!')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await homeState(page)).toEqual({ scrolls: false, cut: [], underLauncher: [] });
    });

    test('Home without a call: no Next call box, still fits, nothing cut or under the button', async ({
      page,
    }) => {
      await fullestHome(page, false);
      await page.goto('/');
      await expect(page.getByText('See you at the community call!')).toBeVisible();
      await expect(page.locator('.home__fair')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Next call' })).toHaveCount(0);
      expect(await homeState(page)).toEqual({ scrolls: false, cut: [], underLauncher: [] });
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
