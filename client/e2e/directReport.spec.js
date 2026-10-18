// ============================================================
// File:        directReport.spec.js
// Path:        client/e2e/directReport.spec.js
// Project:     Seasonal Entertainment
// Description: Reporting a direct message in a real browser (docs/CHAT.md, "Reporting a direct
//              message"): without "Share the selected messages with the moderators" the
//              reporter's browser sends no message text at all; with it, the selected message
//              goes along (so the first check is not vacuous).
// ============================================================

import { expect, test } from '@playwright/test';
import { memberPage } from './members.js';

test('a report shares message text only with consent', async ({ browser }) => {
  const rude = `rude-words-${Date.now()}`;
  const reporter = await memberPage(browser, 'rpreporter');
  const writer = await memberPage(browser, 'rpwriter');

  // The reporter writes in General; the writer answers privately from there.
  await reporter.page.goto('/chat');
  const hello = `hello from rpreporter ${Date.now()}`;
  await reporter.page.getByLabel('Message', { exact: true }).fill(hello);
  await reporter.page.getByRole('button', { name: 'Send' }).click();
  await writer.page.goto('/chat');
  await writer.page
    .getByRole('list', { name: 'Messages in General' })
    .getByRole('listitem')
    .filter({ hasText: hello })
    .getByRole('button', { name: 'rpreporter', exact: true })
    .click();
  await writer.page.getByRole('menuitem', { name: 'Send private message' }).click();
  await writer.page.getByLabel('Message', { exact: true }).fill(rude);
  await writer.page.getByRole('button', { name: 'Send' }).click();
  // Scoped to the conversation: the field may still hold the text until the send completes.
  await expect(
    writer.page.getByRole('list', { name: 'Private messages with rpreporter' }).getByText(rude)
  ).toBeVisible();

  await reporter.page.getByRole('tab', { name: 'Direct' }).click();
  await reporter.page.getByRole('button', { name: /^rpwriter/ }).click();
  const message = reporter.page
    .getByRole('list', { name: 'Private messages with rpwriter' })
    .getByRole('listitem')
    .filter({ hasText: rude });
  const dialog = reporter.page.getByRole('dialog', { name: 'Report a message from rpwriter' });

  await message.getByRole('button', { name: 'Actions for the message from rpwriter' }).click();
  await message.getByRole('menuitem', { name: 'Report' }).click();
  await dialog.getByLabel('Reason').fill('insults');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(reporter.page.getByText('Report sent. Thank you.')).toBeVisible();
  expect(reporter.requests.text()).toContain('/report');
  expect(reporter.requests.text()).not.toContain(rude);

  await message.getByRole('button', { name: 'Actions for the message from rpwriter' }).click();
  await message.getByRole('menuitem', { name: 'Report' }).click();
  await dialog.getByLabel('Reason').fill('insults, with the message');
  await dialog.getByLabel('Share the selected messages with the moderators').check();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog).toBeHidden();
  expect(reporter.requests.text()).toContain(rude);
});
