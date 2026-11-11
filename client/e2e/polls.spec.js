// ============================================================
// File:        polls.spec.js
// Path:        client/e2e/polls.spec.js
// Project:     Seasonal Entertainment
// Description: Polls through the real server (docs/POLLS.md): the run's admin creates a poll on
//              the Polls page (reached from the sidebar), a member votes in another browser and
//              sees the results right after, the admin's page shows the vote without a reload
//              (the chat's live connection), and a guest sees the poll with a sign-in hint;
//              a member votes in the home page's Poll box and the sidebar's dot goes; a team
//              poll stays out of a member's list; a poll started in a chat room beside the
//              composer is voted in the timeline and marked with its room on the Polls page;
//              on a phone (390 x 844, 360 x 740) a member votes, changes the vote and answers
//              in words with no sideways scrolling and 44px targets.
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

test('a poll in a chat room: started beside the composer, voted in the timeline', async ({
  browser,
  baseURL,
}) => {
  const question = `Room poll ${Date.now()}`;
  const admin = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await admin.goto('/chat');
  await admin.getByRole('button', { name: 'Poll' }).click();
  const form = admin.getByRole('form', { name: 'New poll' });
  await form.getByLabel('Question').fill(question);
  await form.getByLabel('Answer 1').fill('Pizza');
  await form.getByLabel('Answer 2').fill('Pasta');
  await form.getByRole('button', { name: 'Create poll' }).click();

  const { page } = await memberPage(browser, 'pollroom');
  await page.goto('/chat');
  const card = page
    .getByRole('list', { name: 'Poll' })
    .filter({ has: page.getByRole('heading', { name: question }) });
  await card.getByRole('radio', { name: 'Pasta' }).check();
  await card.getByRole('button', { name: 'Vote' }).click();
  await expect(card.getByRole('group', { name: `Results: ${question}` })).toContainText(
    'Pasta: 1 (100 %)'
  );
  // On the Polls page, marked with its room.
  await page.goto('/polls');
  const listed = page.getByRole('listitem').filter({ hasText: question });
  await expect(listed.getByRole('link', { name: 'General' })).toHaveAttribute(
    'href',
    '/chat?room=general'
  );
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const { polls } = await (await api.get('/api/polls')).json();
  await api.post(`/api/polls/${polls.find((p) => p.question === question).id}/end`);
  await api.dispose();
});

// On a phone (decided 2026-11-11): no sideways scrolling, every answer and button a 44px
// target, the free-text field and its button in sight once focused; voting, changing the
// vote and a written answer, at 390 x 844 and 360 x 740.
for (const [width, height] of [
  [390, 844],
  [360, 740],
]) {
  test(`${width} x ${height}: vote, change the vote and answer in words on a phone`, async ({
    browser,
    baseURL,
  }) => {
    const api = await newRequest.newContext({
      baseURL,
      storageState: ADMIN_STATE,
      extraHTTPHeaders: { Origin: baseURL },
    });
    const create = async (data) => (await (await api.post('/api/polls', { data })).json()).poll;
    const stamp = `${width} ${Date.now()}`;
    const choice = await create({
      question: `Phone choice ${stamp}`,
      kind: 'choice',
      options: ['A long answer that has to wrap on a narrow phone screen', 'Short'],
      results: 'after_end',
      anonymous: true,
      voters: 'members',
      endsAt: null,
    });
    const words = await create({
      question: `Phone words ${stamp}`,
      kind: 'text',
      options: [],
      results: 'after_vote',
      anonymous: false,
      voters: 'members',
      endsAt: null,
    });

    const { page } = await memberPage(browser, 'pollphone');
    await page.setViewportSize({ width, height });
    await page.goto('/polls');
    // Neither the page nor any poll card, form or field reaches past the window's right edge
    // (the main column clips what is wider, so the page alone would not show it).
    const noSideways = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          [...document.querySelectorAll('.poll-card, .poll-card form, .poll-card textarea')].every(
            (el) => el.getBoundingClientRect().right <= window.innerWidth
          )
      );
    expect(await noSideways()).toBe(true);

    const vote = page.getByRole('form', { name: `Vote: ${choice.question}` });
    const short = vote.locator('label.form-check').filter({ hasText: 'Short' });
    const box = await short.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(
      (await vote.getByRole('button', { name: 'Vote' }).boundingBox()).height
    ).toBeGreaterThanOrEqual(44);
    await short.click();
    await vote.getByRole('button', { name: 'Vote' }).click();
    // Anonymous with results after the end: the vote can be changed.
    const card = page.getByRole('listitem').filter({ hasText: choice.question });
    await expect(card).toContainText('You can change your vote until the poll ends');
    await card.getByRole('radio', { name: /^A long answer/ }).check();
    await card.getByRole('button', { name: 'Change vote' }).click();
    await expect(card).toContainText('1 vote');

    const answer = page.getByRole('form', { name: `Vote: ${words.question}` });
    const field = answer.getByRole('textbox', { name: 'Your answer' });
    await field.fill('More evening events, please.');
    // Focused, the field and its button lie inside the window.
    const inView = async (locator) => {
      const b = await locator.boundingBox();
      return b.y >= 0 && b.y + b.height <= height;
    };
    expect(await inView(field)).toBe(true);
    expect(await inView(answer.getByRole('button', { name: 'Vote' }))).toBe(true);
    await answer.getByRole('button', { name: 'Vote' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: words.question })).toContainText(
      '1 written answer'
    );
    expect(await noSideways()).toBe(true);

    for (const { id } of [choice, words]) await api.post(`/api/polls/${id}/end`);
    await api.dispose();
  });
}
