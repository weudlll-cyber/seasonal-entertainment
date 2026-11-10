// ============================================================
// File:        polls.spec.js
// Path:        client/e2e/polls.spec.js
// Project:     Seasonal Entertainment
// Description: Polls through the real server (docs/POLLS.md): the run's admin creates a poll on
//              the Polls page (reached from the sidebar), a member votes in another browser and
//              sees the results right after, the admin's page shows the vote without a reload
//              (the chat's live connection), and a guest sees the poll with a sign-in hint;
//              a member votes in the home page's Poll box and the sidebar's dot goes; a team
//              poll stays out of a member's list.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { memberPage } from './members.js';

// One after the other: the home box shows the newest open poll, so the tests must not create
// theirs at the same time; each ends its polls when done.
test.describe.configure({ mode: 'serial' });

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
  await adminCard.getByRole('button', { name: 'End now' }).click();
  await expect(adminCard).toContainText('Ended');
});

test('the home box and the sidebar dot; a team poll only for organisers and admins', async ({
  browser,
  baseURL,
}) => {
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const poll = (question, extra = {}) =>
    api
      .post('/api/polls', {
        data: {
          question,
          kind: 'choice',
          options: ['Yes', 'No'],
          results: 'after_vote',
          anonymous: true,
          voters: 'members',
          endsAt: null,
          ...extra,
        },
      })
      .then((res) => res.json())
      .then((answer) => answer.poll);
  const team = await poll(`Team only ${Date.now()}`, { voters: 'team' });
  const open = await poll(`Pizza night? ${Date.now()}`);

  const { page } = await memberPage(browser, 'pollhome');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Polls: 1 open poll to vote in' })).toBeVisible();
  const box = page.getByRole('region', { name: `Poll: ${open.question}` });
  await box.getByRole('combobox', { name: 'Your answer' }).selectOption('Yes');
  await box.getByRole('button', { name: 'Vote' }).click();
  await expect(box).toContainText('You voted · 1 vote');
  await expect(nav.getByRole('link', { name: 'Polls', exact: true })).toBeVisible();

  // The team poll: not on the member's Polls page.
  await page.goto('/polls');
  await expect(page.getByRole('heading', { name: open.question })).toBeVisible();
  await expect(page.getByRole('heading', { name: team.question })).toHaveCount(0);

  for (const { id } of [team, open]) await api.post(`/api/polls/${id}/end`);
  await api.dispose();
});
