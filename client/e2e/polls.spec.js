// ============================================================
// File:        polls.spec.js
// Path:        client/e2e/polls.spec.js
// Project:     Seasonal Entertainment
// Description: Polls through the real server (docs/POLLS.md): the run's admin creates a poll on
//              the Polls page (reached from the sidebar), a member votes in another browser and
//              sees the results right after, the admin's page shows the vote without a reload
//              (the chat's live connection), and a guest sees the poll with a sign-in hint.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { memberPage } from './members.js';

test('an admin creates a poll, a member votes, the admin sees it live', async ({ browser }) => {
  const question = `Which evening? ${Date.now()}`;
  const admin = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await admin.goto('/');
  await admin
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Polls' })
    .click();
  await admin.getByRole('button', { name: 'New poll' }).click();
  const form = admin.getByRole('form', { name: 'New poll' });
  await form.getByLabel('Question').fill(question);
  await form.getByLabel('Answer 1').fill('Friday');
  await form.getByLabel('Answer 2').fill('Saturday');
  await form.getByRole('button', { name: 'Create poll' }).click();
  const adminCard = admin.getByRole('listitem').filter({ hasText: question });
  await expect(adminCard).toContainText('0 votes');

  // A member the run's setup made (members.js): registering would count against the limit.
  const name = 'pollvoter';
  const { page: member } = await memberPage(browser, name);
  await member.goto('/polls');
  const vote = member.getByRole('form', { name: `Vote: ${question}` });
  await expect(vote).toContainText('This poll is not anonymous – your name will be shown.');
  await vote.getByRole('radio', { name: 'Saturday' }).check();
  await vote.getByRole('button', { name: 'Vote' }).click();
  const results = member.getByRole('group', { name: `Results: ${question}` });
  await expect(results).toContainText('Saturday: 1 (100 %)');
  await expect(results).toContainText(name);

  // The admin's page heard of it over the live connection.
  await expect(adminCard).toContainText('1 vote');

  const guest = await (await browser.newContext()).newPage();
  await guest.goto('/polls');
  const guestCard = guest.getByRole('listitem').filter({ hasText: question });
  await expect(guestCard.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(guestCard.getByRole('button', { name: 'Vote' })).toHaveCount(0);
});
