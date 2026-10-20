// ============================================================
// File:        events.spec.js
// Path:        client/e2e/events.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server reading the event bot's database (the
//              fixture built for the run, server/src/bots/fixtures.js; docs/BOTS.md): a guest in
//              Berlin sees this week's "[Sample] Bot Quiz Night" (Tuesdays 20:00 UTC) at the
//              right local time, and the canceled "[Sample] Bot Weekend Stream" struck through.
//              The admin area has no events editor any more.
// ============================================================

import { expect, test } from '@playwright/test';
import { formatDay, formatLocal, startOfWeek } from '../../shared/localWeek.js';
import { ADMIN_STATE } from './adminState.js';

const ZONE = 'Europe/Berlin';
const DAY_MS = 24 * 60 * 60 * 1000;
test.use({ timezoneId: ZONE });

test("the bot's week in local time; a canceled one struck through", async ({ page }) => {
  // The fixture's weeks start on Monday 00:00 UTC; Tuesday 20:00 UTC of this UTC week is in
  // the Berlin week the page opens on (which starts Sunday 22:00 or 23:00 UTC).
  const now = Date.now();
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const mondayUtc = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS;
  let quiz = mondayUtc + DAY_MS + 20 * 60 * 60 * 1000;
  // Late on Sunday UTC the Berlin week has already moved on: next week's quiz is shown.
  if (quiz < startOfWeek(now, ZONE)) quiz += 7 * DAY_MS;
  const local = formatLocal(quiz, ZONE);

  await page.goto('/events');
  await expect(page.getByText(ZONE)).toBeVisible();
  const day = page.getByRole('region', { name: formatDay(quiz, ZONE) });
  const entry = day.getByRole('listitem').filter({ hasText: '[Sample] Bot Quiz Night' });
  await expect(entry).toContainText(`${local.time} ${local.zone}`);
  await expect(entry).toContainText('(20:00 UTC)');
  // Canceled in the fixture's current UTC week; that is this page's week except late on Sunday.
  if (quiz === mondayUtc + DAY_MS + 20 * 60 * 60 * 1000) {
    const stream = page.getByRole('listitem').filter({ hasText: '[Sample] Bot Weekend Stream' });
    await expect(stream.locator('del')).toHaveText('[Sample] Bot Weekend Stream');
    await expect(stream).toContainText('canceled');
  }
});

test('the admin area has no events editor', async ({ browser }) => {
  const admin = await browser.newContext({ storageState: ADMIN_STATE });
  const page = await admin.newPage();
  await page.goto('/admin/users');
  const sections = page.getByRole('navigation', { name: 'Admin', exact: true });
  await expect(sections.getByRole('link', { name: 'Users' })).toBeVisible();
  await expect(sections.getByRole('link', { name: 'Events' })).toHaveCount(0);
  await admin.close();
});
