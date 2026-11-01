// ============================================================
// File:        manageEvents.spec.js
// Path:        client/e2e/manageEvents.spec.js
// Project:     Seasonal Entertainment
// Description: Manage events in a real browser: the sidebar item only for staff and only while
//              the server is set up for the event bot's admin page, and the page showing that
//              page in a same-origin frame (or the message and Retry while it does not answer).
//              The run's server keeps BOT_ADMIN_EMBEDDED off, so no other spec sees the extra
//              item: "set up" is the page's own session answer with features.botAdmin on
//              (page.route), and the bot behind /bot-admin/ (the host's nginx in production) is a
//              small stub page answered by page.route too.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

const STUB = '<!doctype html><title>Bot admin</title><h1>Stub bot admin page</h1>';

// The page's session answer from the real server, with the feature on and, for `role`, that
// role in place of the real one (a member without logging one in: the item is the client's).
async function setUp(page, { role } = {}) {
  await page.route('**/api/auth/session', async (route) => {
    const answer = await (await route.fetch()).json();
    const user = role
      ? { id: 999, username: 'e2erole', email: 'r@example.org', role }
      : answer.user;
    await route.fulfill({ json: { ...answer, user, features: { botAdmin: true } } });
  });
}

// The bot behind /bot-admin/: its health answer (OK or not) and its admin page.
async function stubBot(page, healthy) {
  const state = { healthy };
  await page.route('**/bot-admin/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/bot-admin/health') {
      return route.fulfill(state.healthy ? { json: { ok: true } } : { status: 502, body: '' });
    }
    return route.fulfill({ contentType: 'text/html', body: STUB });
  });
  return state;
}

const manageLink = (page) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Manage events' });

test('guests and members never see Manage events', async ({ page }) => {
  await setUp(page);
  await page.goto('/games');
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
  await expect(manageLink(page)).toHaveCount(0);
});

test('a member does not see it either, even when it is set up', async ({ page }) => {
  await setUp(page, { role: 'member' });
  await page.goto('/games');
  await expect(page.getByText('e2erole').first()).toBeVisible();
  await expect(manageLink(page)).toHaveCount(0);
});

test.describe('staff', () => {
  test.use({ storageState: ADMIN_STATE });

  test('not set up on this server: no item', async ({ page }) => {
    await page.goto('/games');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
    await expect(manageLink(page)).toHaveCount(0);
  });

  test('set up: the item opens the bot admin page in a frame', async ({ page }) => {
    await setUp(page);
    await stubBot(page, true);
    await page.goto('/games');
    await manageLink(page).click();
    await expect(page).toHaveURL(/\/manage-events$/);
    const frame = page.frameLocator('iframe[title="Event bot admin"]');
    await expect(frame.getByRole('heading', { name: 'Stub bot admin page' })).toBeVisible();
    // It fills the content area: most of the main column's width and height.
    const main = await page.locator('.shell__main').boundingBox();
    const box = await page.locator('iframe[title="Event bot admin"]').boundingBox();
    expect(box.width).toBeGreaterThan(main.width * 0.8);
    expect(box.height).toBeGreaterThan(main.height * 0.6);
  });

  test('the bot does not answer: the message, and Retry loads it once it does', async ({
    page,
  }) => {
    await setUp(page);
    const bot = await stubBot(page, false);
    await page.goto('/manage-events');
    await expect(page.getByRole('alert')).toHaveText(
      "The event bot's admin page does not answer right now."
    );
    await expect(page.locator('iframe')).toHaveCount(0);
    bot.healthy = true;
    await page.getByRole('button', { name: 'Retry' }).click();
    const frame = page.frameLocator('iframe[title="Event bot admin"]');
    await expect(frame.getByRole('heading', { name: 'Stub bot admin page' })).toBeVisible();
  });
});
