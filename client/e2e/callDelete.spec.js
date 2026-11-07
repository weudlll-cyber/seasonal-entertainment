// ============================================================
// File:        callDelete.spec.js
// Path:        client/e2e/callDelete.spec.js
// Project:     Seasonal Entertainment
// Description: Deleting a call in a real browser (docs/CALLS.md, "Deleting a call"): the run's
//              admin creates a planned call on /calls, starts it (which opens its page,
//              docs/CALLS.md, "Calls on the site"), ends it back on /calls, then deletes it there
//              after the confirmation, which names it; the "Recent" list no longer shows it, and
//              its page says it does not exist.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

test.use({ storageState: ADMIN_STATE });

test('an admin creates, starts, ends and deletes a call; "Recent" no longer shows it', async ({
  page,
}) => {
  const title = `Test call ${Date.now().toString(36)}`;
  await page.goto('/calls');
  const form = page.getByRole('form', { name: 'New call' });
  await form.getByLabel('Title').fill(title);
  // Planned, so the form only creates it ("Start call now" would start it at once).
  await form.getByLabel('Planned start (optional)').fill('2030-01-01T19:00');
  await form.getByRole('button', { name: 'Create call' }).click();
  await page.getByRole('button', { name: `Start ${title}` }).click();
  // Starting opens the call's page; the call is ended from the list.
  await expect(page).toHaveURL(/\/calls\/\d+$/);
  await page.goto('/calls');
  await page.getByRole('button', { name: `End ${title} for everyone` }).click();
  const recent = page.getByRole('region', { name: 'Recent' });
  const deleteButton = recent.getByRole('button', { name: `Delete ${title}` });
  await expect(deleteButton).toBeVisible();
  const href = await recent.getByRole('link', { name: `Details of ${title}` }).getAttribute('href');

  const asked = [];
  page.once('dialog', (dialog) => {
    asked.push(dialog.message());
    dialog.accept();
  });
  await deleteButton.click();
  await expect(recent.getByText(title, { exact: true })).toHaveCount(0);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain(`"${title}"`);
  expect(asked[0]).toContain('Its chat and its recordings are deleted too');

  await page.goto(href);
  await expect(page.getByText('No such call.')).toBeVisible();
});
