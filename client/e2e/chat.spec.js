// ============================================================
// File:        chat.spec.js
// Path:        client/e2e/chat.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server and WebSocket (CSP connect-src applies):
//              a guest's message reaches a member live with a Guest badge, a guest's link is
//              refused, and when the admin hides the message it disappears for the member live.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { newAccountData } from './accountKeys.js';
import { ADMIN_STATE } from './adminState.js';

test('live chat between a guest and a member, and moderation', async ({ browser, baseURL }) => {
  const member = `chat${Date.now().toString(36)}`;
  const api = await newRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
    storageState: { cookies: [], origins: [] },
  });
  await api.post('/api/auth/register', {
    data: await newAccountData(member, 'correct-horse-1'),
  });
  const memberContext = await browser.newContext({ storageState: await api.storageState() });
  await api.dispose();
  const memberPage = await memberContext.newPage();
  await memberPage.goto('/chat');
  await expect(memberPage.getByRole('button', { name: 'General', exact: true })).toBeVisible();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto('/chat');
  const text = `hello from a guest ${Date.now()}`;
  await guestPage.getByLabel('Message', { exact: true }).fill(text);
  await guestPage.getByRole('button', { name: 'Send' }).click();
  // Scoped to the list: the live push can show the message before the composer is cleared.
  await expect(
    guestPage.getByRole('list', { name: 'Messages in General' }).getByText(text)
  ).toBeVisible();
  await expect(guestPage.getByText(/You are writing as Guest-/)).toBeVisible();

  // Live on the member's screen, without reloading.
  const seen = memberPage.getByRole('listitem').filter({ hasText: text });
  await expect(seen).toBeVisible();
  await expect(seen.getByText('Guest', { exact: true })).toBeVisible();

  await guestPage.getByLabel('Message', { exact: true }).fill('come to scam-site.xyz');
  await guestPage.getByRole('button', { name: 'Send' }).click();
  await expect(guestPage.getByRole('alert')).toContainText('Guests cannot post links');

  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/chat');
  // The message's "…" menu; Hide asks first.
  const item = adminPage.getByRole('listitem').filter({ hasText: text });
  await item.hover();
  await item.getByRole('button', { name: /^Actions for the message from/ }).click();
  await item.getByRole('menuitem', { name: 'Hide' }).click();
  await item.getByRole('button', { name: 'Hide' }).click();
  await expect(adminPage.getByText('Message hidden.')).toBeVisible();

  await expect(seen).toHaveCount(0);
  await Promise.all([memberContext.close(), guestContext.close(), adminContext.close()]);
});
