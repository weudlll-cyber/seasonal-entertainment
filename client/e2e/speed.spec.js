// ============================================================
// File:        speed.spec.js
// Path:        client/e2e/speed.spec.js
// Project:     Seasonal Entertainment
// Description: Guards the speed and phone-width work (docs/DESIGN.md, "Speed"):
//              - the home page does not load the chunks of pages loaded on first use (call
//                page, prices, info pages, admin, embedded chat);
//              - on a phone, home and prices hardly shift while their data arrives late (the
//                boxes keep their room);
//              - on a phone every control is a 44px target (links inside running text aside).
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

const PHONE = { width: 390, height: 844 };

test('the home page loads none of the chunks kept for later; prices loads its own', async ({
  page,
}) => {
  const scripts = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const later = scripts.filter((p) =>
    /\/(CallPage|PricesPage|InfoPage|Markdown|Admin\w*|InfoEditorPage|Embed\w*)-/.test(p)
  );
  expect(later).toEqual([]);
  // ...and the prices page does fetch its own when it is opened.
  scripts.length = 0;
  await page.goto('/info/prices');
  await expect(page.getByRole('heading', { level: 1, name: 'Prices' })).toBeVisible();
  expect(scripts.filter((p) => /\/PricesPage-/.test(p))).toHaveLength(1);
});

// The layout shift of the page so far (CLS, without shifts right after input).
const layoutShift = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let sum = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) sum += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(sum), 300);
      })
  );

// The page's own data answers a second late, as on a slow connection.
async function slowData(page, paths) {
  for (const path of paths)
    await page.route(`**/api/${path}**`, async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue();
    });
}

test.describe('on a phone, late data hardly moves the page', () => {
  test.use({ viewport: PHONE });

  test('home: the game and the events arrive into kept room', async ({ page }) => {
    await slowData(page, ['games', 'bot-events', 'prices']);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // networkidle: after the late answers have arrived and been drawn.
    await page.waitForLoadState('networkidle');
    expect(await layoutShift(page)).toBeLessThan(0.05);
  });

  test('prices: the coin buttons stand while their prices load', async ({ page }) => {
    // The run has no price bot: a connected answer, a second late (as prices.spec.js does).
    const card = (token, price) => ({ token, price, at: 1, change24h: 0, spark: [] });
    const seasons = ['spring', 'summer', 'autumn', 'winter'].map((t) => card(t, 0.004));
    await page.route('**/api/prices', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fulfill({
        json: { ok: true, connected: true, miningRates: {}, prices: seasons },
      });
    });
    await slowData(page, ['reference-prices']);
    await page.goto('/info/prices');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    // The price has arrived in its button ("Spring$0.004000…" once loaded, "Spring—" before).
    await expect(page.getByRole('button', { name: /^Spring\s*\$\d/ })).toBeVisible();
    expect(await layoutShift(page)).toBeLessThan(0.05);
  });
});

// Every visible control smaller than 44 x 44 px; a checkbox counts by its label, a link
// inside running text is exempt (WCAG 2.5.8).
const smallTargets = (page) =>
  page.evaluate(() => {
    const small = [];
    const controls = 'a, button, input:not([type=hidden]), select, textarea, [role=tab]';
    for (const el of document.querySelectorAll(controls)) {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (style.visibility === 'hidden' || box.width === 0 || box.height === 0) continue;
      const target = el.closest('label')?.getBoundingClientRect() ?? box;
      if (Math.max(box.width, target.width) >= 43.5 && Math.max(box.height, target.height) >= 43.5)
        continue;
      if (el.tagName === 'A' && style.display === 'inline' && el.closest('p, li, dd, td')) continue;
      small.push(`${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent).trim()}"`);
    }
    return small;
  });

test.describe('on a phone every control is a 44px target', () => {
  test.use({ viewport: PHONE });

  for (const path of ['/', '/events', '/info/prices', '/register', '/chat']) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await smallTargets(page)).toEqual([]);
    });
  }

  test.describe('signed in as admin', () => {
    test.use({ storageState: ADMIN_STATE });

    for (const path of ['/account', '/admin/users', '/admin/info']) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await smallTargets(page)).toEqual([]);
      });
    }
  });
});
