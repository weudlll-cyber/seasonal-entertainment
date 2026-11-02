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
//              2026-10-21), no price runs under its season mark. Shorter windows (1200 x 650,
//              1366 x 768, 1500 x 940; 2026-11-01): Home the same, and the admin's sidebar fits
//              without a scrollbar; so does the full staff menu with "Manage events" set up, for
//              an admin and for an organiser (Site banner), light and dark, at those sizes, at
//              1915 x 913, 1920 x 1080, 1680 x 900, 2560 x 1080 and at 1277 x 609 (a 1915 x 913
//              window at 150 % zoom; 2026-11-02). At
//              390 x 844 (phone): no window scroll, a top bar, and the navigation drawer opens
//              and closes (close button,
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
    // What a visitor sees: not the faint logo part, nor an entry hidden because it does not
    // fit whole (useWholeItems.js).
    const seen = (box) =>
      [...box.querySelectorAll('*')].filter(
        (el) =>
          !el.closest('.home__wash') &&
          getComputedStyle(el).position !== 'absolute' &&
          getComputedStyle(el).visibility !== 'hidden' &&
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
      // Cut: reaching past the box's bottom or top, or past any part inside it that clips (a
      // list that hides its overflow would otherwise cut a message without the box noticing).
      cut: boxes
        .filter((box) =>
          seen(box).some((el) => {
            const { top, bottom } = el.getBoundingClientRect();
            for (let up = el.parentElement; up && up !== box.parentElement; up = up.parentElement) {
              // A title clamped after its lines hides the rest on purpose (ellipsis).
              if (getComputedStyle(up).webkitLineClamp !== 'none') return false;
              const clips = getComputedStyle(up).overflowY !== 'visible' || up === box;
              const edge = up.getBoundingClientRect();
              if (clips && (bottom > edge.bottom + 1 || top < edge.top - 1)) return true;
            }
            return false;
          })
        )
        .map(name),
      // A price tile whose price runs under its season mark (its text, not its box).
      underMark: [...document.querySelectorAll('.price-tile')]
        .filter((tile) => {
          const text = document.createRange();
          text.selectNodeContents(tile.querySelector('.price-tile__price'));
          const price = text.getBoundingClientRect();
          const mark = tile.querySelector('.price-tile__mark').getBoundingClientRect();
          return price.right > mark.left && price.bottom > mark.top && price.top < mark.bottom;
        })
        .map((tile) => tile.querySelector('.price-tile__name').textContent),
      underLauncher: boxes.flatMap((box) =>
        seen(box)
          .filter((el) => el.matches('a, button, p, h2, span, strong, li, img, time') && under(el))
          .map((el) => `${name(box)}: ${el.textContent.trim().slice(0, 30)}`)
      ),
    };
  });

// The fullest home, whatever other specs do meanwhile (they start their own calls): a planned
// call with a 58-character title and the longest date (with the year), first in "Up next" and
// in the Next call box with both of its buttons (as the run's admin), 3 recent messages in
// General and the widest prices (the price bot is off in this run) — answered here, as
// prices.spec.js does. withCall false: no live or planned call.
const CALL = {
  id: 999,
  title: 'Seasonal Tokens community call: the four seasons explained',
  status: 'scheduled',
  description: '',
  scheduledFor: '2000-01-01T19:00:00.000Z',
};
// The widest prices the tiles show: down to four zeros after the point, and a large one.
const PRICES = [
  ['spring', 0.001804, -0.0421],
  ['summer', 0.0002117, 0.0135],
  ['autumn', 0.002117, -0.0083],
  ['winter', 1234.5678, -0.1257],
].map(([token, price, change24h]) => ({ token, price, change24h, at: 0, spark: [] }));
async function fullestHome(page, withCall) {
  await page.route('**/api/prices', (route) =>
    route.fulfill({ json: { ok: true, connected: true, prices: PRICES } })
  );
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

const HOME_OK = { scrolls: false, cut: [], underMark: [], underLauncher: [] };

// The sidebar's panel scrolls when its links do not fit its height.
const sidebarScrolls = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.sidebar__panel');
    return panel.scrollHeight > panel.clientHeight;
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
      expect(await homeState(page)).toEqual(HOME_OK);
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
      expect(await homeState(page)).toEqual(HOME_OK);
    });
  });
}

// Shorter and narrower windows seen on 2026-11-01 (a 1500 x 940 window at 125 % display
// scaling leaves about 1200 x 650 for the page): Home has every box whole (no label cut at the
// top, only whole "Up next" entries), no price under its mark, and the admin's sidebar fits
// without scrolling. Below 1280 x 720 the fullest home may scroll its column instead (then
// something can pass under the chat button while scrolling).
const SHORT = [
  [1200, 650],
  [1366, 768],
  [1500, 940],
];
for (const [width, height] of SHORT) {
  test.describe(`${width} x ${height} (home)`, () => {
    test.use({ viewport: { width, height } });

    test('Home: no box cut, no price under its mark, the sidebar without a scrollbar', async ({
      page,
    }) => {
      await fullestHome(page, true);
      await page.goto('/');
      await expect(page.getByText('See you at the community call!')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const { cut, underMark, ...rest } = await homeState(page);
      expect({ cut, underMark }).toEqual({ cut: [], underMark: [] });
      if (width >= 1280 && height >= 720) {
        expect(rest).toEqual({ scrolls: false, underLauncher: [] });
      }
      expect(await sidebarScrolls(page)).toBe(false);
    });
  });
}

// The fullest staff menu: the event bot's admin page set up (features.botAdmin) and the role
// given, both only in this page's session answer (the pages check again; here only the menu
// counts).
async function staffMenu(page, role) {
  await page.route('**/api/auth/session', async (route) => {
    const answer = await (await route.fetch()).json();
    answer.user.role = role;
    answer.features = { ...answer.features, botAdmin: true };
    await route.fulfill({ json: answer });
  });
}
// Every window the menu was seen in (2026-11-02): the short ones above, wide ones, and the
// owner's 1915 x 913 window at 150 % browser zoom, which leaves 1277 x 609 CSS pixels.
const MENU_SIZES = [...SHORT, [1915, 913], [1920, 1080], [1680, 900], [2560, 1080], [1277, 609]];
for (const [width, height] of MENU_SIZES) {
  for (const role of ['admin', 'organiser']) {
    for (const colorScheme of ['light', 'dark']) {
      test(`${width} x ${height}: the ${role}'s full menu fits without a scrollbar (${colorScheme})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme });
        await staffMenu(page, role);
        await page.goto('/');
        const nav = page.getByRole('navigation', { name: 'Main' });
        await expect(nav.getByRole('link', { name: 'Manage events' })).toBeVisible();
        await expect(
          nav.getByRole('link', { name: role === 'admin' ? 'Admin' : 'Site banner' })
        ).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await sidebarScrolls(page)).toBe(false);
      });
    }
  }
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
