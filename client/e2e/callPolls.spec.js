// ============================================================
// File:        callPolls.spec.js
// Path:        client/e2e/callPolls.spec.js
// Project:     Seasonal Entertainment
// Description: A poll in a live call with two participants (docs/POLLS.md, "Polls in a call"):
//              the run's admin hosts and starts a 1-minute poll from the call page; the member
//              in the call sees it under the stage with its countdown and votes; the admin's
//              page shows the vote; ending the call ends the poll, and the Polls page lists it
//              ended, marked with its call.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { openCall } from './callPage.js';
import { memberPage } from './members.js';

test('a poll in a live call: started there, voted beside the stage, ended with the call', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const api = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const title = `Poll call ${Date.now()}`;
  const call = (await (await api.post('/api/calls', { data: { title } })).json()).call;
  expect((await api.post(`/api/calls/${call.id}/start`)).status()).toBe(200);

  const host = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  await openCall(host, call.id);
  await host.getByRole('button', { name: 'Join call' }).click();
  const member = (await memberPage(browser, 'callpoll')).page;
  await openCall(member, call.id);
  await member.getByRole('button', { name: 'Join call' }).click();

  await host.getByRole('button', { name: 'Start a poll' }).click();
  const form = host.getByRole('form', { name: 'New poll' });
  await form.getByLabel('Question').fill('Which topic next?');
  await form.getByLabel('Answer 1').fill('Prices');
  await form.getByLabel('Answer 2').fill('Games');
  await expect(form.getByRole('radio', { name: '1 minute' })).toBeChecked();
  await form.getByRole('button', { name: 'Create poll' }).click();
  const hostPanel = host.getByRole('region', { name: 'Polls in this call' });
  await expect(hostPanel.getByRole('timer')).toHaveText(/^0:[0-5]\d left$/);

  // The member in the call: the poll under the stage within the page's 10 seconds at most.
  const panel = member.getByRole('region', { name: 'Polls in this call' });
  await expect(panel.getByRole('heading', { name: 'Which topic next?' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel.getByRole('timer')).toBeVisible();
  await panel.getByRole('radio', { name: 'Games' }).check();
  await panel.getByRole('button', { name: 'Vote' }).click();
  await expect(panel.getByRole('group', { name: 'Results: Which topic next?' })).toContainText(
    'Games: 1 (100 %)'
  );
  await expect(hostPanel).toContainText('1 vote');

  // Ending the call ends its poll; the Polls page lists it with its call.
  expect((await api.post(`/api/calls/${call.id}/end`)).status()).toBe(200);
  await host.goto('/polls');
  const card = host
    .getByRole('list', { name: 'Ended polls' })
    .getByRole('listitem')
    .filter({ hasText: 'Which topic next?' })
    .first();
  await expect(card.getByRole('link', { name: title })).toHaveAttribute(
    'href',
    `/calls/${call.id}`
  );
  await api.dispose();
});
