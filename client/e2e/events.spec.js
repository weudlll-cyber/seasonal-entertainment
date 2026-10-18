// ============================================================
// File:        events.spec.js
// Path:        client/e2e/events.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server (which seeds the schedule on its first
//              start): a guest in Berlin sees Monday's Seasonal Mind Games at the right local
//              time; the admin deactivates the S.T Badge Race and it disappears for guests.
// ============================================================

import { expect, test } from '@playwright/test';
import {
  formatDay,
  formatLocal,
  occurrencesInWeek,
  startOfWeek,
} from '../../shared/eventSchedule.js';
import { ADMIN_STATE } from './adminState.js';

const ZONE = 'Europe/Berlin';
test.use({ timezoneId: ZONE });

test('the week in local time, and a deactivated event is gone', async ({ page, browser }) => {
  // Where Monday 18:00 UTC falls this week in Berlin, computed with the same rules.
  const week = startOfWeek(Date.now(), ZONE);
  const [monday] = occurrencesInWeek(
    [{ id: 1, rule: 'weekly', weekday: 1, timeUtc: '18:00' }],
    week,
    ZONE
  );
  const local = formatLocal(monday.start, ZONE);

  await page.goto('/events');
  await expect(page.getByText(ZONE)).toBeVisible();
  const day = page.getByRole('region', { name: formatDay(monday.start, ZONE) });
  const mindGames = day.getByRole('listitem').filter({ hasText: 'Seasonal Mind Games' });
  await expect(mindGames).toContainText(`${local.time} ${local.zone}`);
  await expect(mindGames).toContainText('(18:00 UTC)');
  await expect(page.getByText('S.T Badge Race')).toBeVisible();

  const admin = await browser.newContext({ storageState: ADMIN_STATE, timezoneId: ZONE });
  const editor = await admin.newPage();
  await editor.goto('/admin/events');
  const row = editor.getByRole('row').filter({ hasText: 'S.T Badge Race' });
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row).toContainText('inactive');
  await admin.close();

  await page.reload();
  await expect(page.getByText('Seasonal Mind Games').first()).toBeVisible();
  await expect(page.getByText('S.T Badge Race')).toHaveCount(0);
});
