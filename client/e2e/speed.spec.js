// ============================================================
// File:        speed.spec.js
// Path:        client/e2e/speed.spec.js
// Project:     Seasonal Entertainment
// Description: Guards the speed and phone-width work (docs/DESIGN.md, "Speed"):
//              - the home page does not load the chunks of pages loaded on first use (call
//                page, prices, info pages, admin, embedded chat);
//              - on a phone, home and prices hardly shift while their data arrives late (the
//                boxes keep their room); home on three pinned dates (UTC), without calls (so a
//                call another spec made cannot change it), a failure naming what moved;
//              - on a phone every control is a 44px target (links inside running text aside),
//                also the home page's "Next call" title when it is as short as "Fit" (the call
//                callFit.spec.js makes, which made the home check fail once in a full run);
//              - the sign-up page's "or with email and a password" line keeps both divider lines
//                at 360 px and on a desktop (they shrank to nothing at phone width, 2026-11-04).
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { DISCORD_SERVER_URL } from './ports.js';

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

// The layout shift of the page so far (CLS, without shifts right after input): { sum, shifts },
// shifts naming each shift's elements and how they moved, for the failure message (a shift
// seen only on CI must say what moved).
const layoutShift = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let sum = 0;
        const shifts = [];
        const name = (node) =>
          node?.nodeType === 1
            ? `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`
            : (node?.parentElement?.className ?? '#text');
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.hadRecentInput) continue;
            sum += e.value;
            const moved = e.sources.map(
              (s) =>
                `${name(s.node)} y ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h ${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`
            );
            shifts.push(
              `${e.value.toFixed(4)} at ${Math.round(e.startTime)} ms: ${moved.join('; ')}`
            );
          }
        }).observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve({ sum, shifts }), 300);
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

// The page's own answer, a second late: what home shows then is the same on every run (the
// server's fake bot data moves with the clock).
const lateAnswer = (page, path, json) =>
  page.route(`**/api/${path}**`, async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.fulfill({ json });
  });

// Home on a phone, pinned to a date (and UTC) so a run is reproducible; the layout must hold for
// any date. The three dates give the season clock's three lengths of "Next halving: …" (the
// longest, 2027-09-03: "Winter, Saturday 4 September"; the shortest, 2028-06-03), and both
// events have names that wrap on a phone.
const HOME_DATES = ['2026-11-01T12:00:00Z', '2027-09-03T12:00:00Z', '2028-06-03T12:00:00Z'];
const GAME = {
  id: 1,
  name: 'Seasonal Race',
  description: 'A race game for the Seasonal Tokens community.',
  image: 'seasonal-tokens',
  status: 'coming_soon',
  path: '/games/race',
};
const occurrences = (now) =>
  [
    'Seasonal Tokens community quiz night with prizes for every season',
    'Trading contest: the four seasons against each other, all week',
  ].map((name, index) => ({
    id: index + 1,
    name,
    start: now + (index + 1) * 6 * 60 * 60_000,
    status: 'scheduled',
    image: null,
  }));

const callsAnswer = (upcoming) => ({
  ok: true,
  configured: true,
  calls: { live: [], upcoming, recent: [] },
  reminders: [],
});
const noCalls = callsAnswer([]);

test.describe('on a phone, late data hardly moves the page', () => {
  test.use({ viewport: PHONE, timezoneId: 'UTC' });

  for (const date of HOME_DATES) {
    test(`home on ${date.slice(0, 10)}: the game and the events arrive into kept room`, async ({
      page,
    }) => {
      const now = Date.parse(date);
      await page.clock.setFixedTime(now);
      await lateAnswer(page, 'games', { ok: true, games: [GAME] });
      await lateAnswer(page, 'bot-events', {
        ok: true,
        connected: true,
        occurrences: occurrences(now),
      });
      await slowData(page, ['prices']);
      // No calls: a call another spec made (callFit.spec.js) would join "Up next" and push the
      // second event out of it.
      await page.route('**/api/calls', (route) => route.fulfill({ json: noCalls }));
      // No poll either: one polls.spec.js leaves open for a moment would add the home's box.
      await page.route('**/api/polls/summary', (route) =>
        route.fulfill({ json: { ok: true, unvoted: 0, newest: null } })
      );
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // networkidle: after the late answers have arrived and been drawn.
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(occurrences(now)[1].name)).toBeVisible();
      const { sum, shifts } = await layoutShift(page);
      // The value of every run in the report, not only of a failing one.
      test.info().annotations.push({
        type: 'layout shift',
        description: [sum.toFixed(4), ...shifts].join(' | '),
      });
      expect(sum, shifts.join('\n')).toBeLessThan(0.05);
    });
  }

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
    const { sum, shifts } = await layoutShift(page);
    expect(sum, shifts.join('\n')).toBeLessThan(0.05);
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

  // The next call's title link, whatever its length: the answer is fixed here, so the check
  // never depends on which call another spec planned.
  for (const title of ['Fit', 'Seasonal Tokens community call: the four seasons explained']) {
    test(`/ with the next call "${title}"`, async ({ page }) => {
      const next = { id: 999, title, scheduledFor: '2099-01-01T19:00:00.000Z' };
      await page.route('**/api/calls', (route) => route.fulfill({ json: callsAnswer([next]) }));
      await page.goto('/');
      await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
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

for (const width of [360, 1280]) {
  test(`/register at ${width}px: the "or" line keeps both divider lines`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // The "or" line comes with "Sign up with Discord": the run's server with Discord on.
    await page.goto(`${DISCORD_SERVER_URL}/register`);
    const or = page.getByText('or with email and a password', { exact: false });
    await expect(or).toBeVisible();
    // The lines are the line's ::before and ::after (client/src/discord/Discord.css).
    const lines = await or.evaluate((el) =>
      ['::before', '::after'].map((part) => parseFloat(getComputedStyle(el, part).width))
    );
    for (const line of lines) expect(line).toBeGreaterThanOrEqual(16);
  });
}
