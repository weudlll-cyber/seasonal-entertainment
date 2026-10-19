// ============================================================
// File:        embedForeign.spec.js
// Path:        client/e2e/embedForeign.spec.js
// Project:     Seasonal Entertainment
// Description: The chat embedded on another site, in a real browser under the server's real
//              headers (docs/EMBED.md). The Vite dev server's origin stands in for a game site:
//              before an admin approves it, the browser refuses to show the chat there; once
//              approved, a member logs in through the popup on this site (normal login, then
//              the password for private messages), the host page's cookies are cleared (the
//              token alone carries on), and the member exchanges a private message with another
//              member, both ways. The host page never sees the token or the text. Removing the
//              site logs the embed out at once.
// ============================================================

import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { frameOf, refused } from './frames.js';
import { MEMBER_PASSWORD, memberPage } from './members.js';
import { DEV_PROXY_URL, SERVER_PORT } from './ports.js';

const SERVER = `http://127.0.0.1:${SERVER_PORT}`;
const GAME = DEV_PROXY_URL; // another origin than the site: the "game site"
const EMBED = `${SERVER}/embed/chat?room=general`;

test('a member chats privately in the chat embedded on an approved site', async ({ browser }) => {
  const canary = `from-the-game-${randomBytes(6).toString('hex')}`;
  // Both members have their key pairs (first login); the fan's own browser is closed again.
  const pal = await memberPage(browser, 'embedpal');
  await (await memberPage(browser, 'embedfan')).page.context().close();
  const admin = await browser.newContext({ storageState: ADMIN_STATE, baseURL: SERVER });
  const site = (method) =>
    admin.request.fetch('/api/admin/embed-origins', {
      method,
      data: { origin: GAME },
      headers: { Origin: SERVER },
    });

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto(`${GAME}/`);
  expect(refused(await frameOf(host, EMBED))).toBe(true);

  expect((await site('POST')).status()).toBe(201);
  await host.reload();
  // Everything the game page receives from the chat.
  await host.evaluate(() => {
    window.fromChat = [];
    window.addEventListener('message', (e) => window.fromChat.push([e.origin, e.data]));
  });
  const chat = await frameOf(host, EMBED);
  expect(refused(chat)).toBe(false);
  await expect(chat.getByRole('region', { name: 'Chat: General' })).toBeVisible();

  // The login popup: on this site, the normal login, then the password for private messages.
  // `exact`: a guest's room also offers "Log in to write" (the same popup), once it has loaded.
  const opening = host.waitForEvent('popup');
  await chat.getByRole('button', { name: 'Log in', exact: true }).click();
  const popup = await opening;
  await expect(popup).toHaveURL(`${SERVER}/embed-login?origin=${encodeURIComponent(GAME)}`);
  await expect(popup.getByText(GAME)).toBeVisible();
  await popup.getByRole('link', { name: 'Log in' }).click();
  const login = popup.getByRole('main');
  await login.getByLabel('Username').fill('embedfan');
  await login.getByLabel('Password').fill(MEMBER_PASSWORD);
  await login.getByRole('button', { name: 'Log in' }).click();
  // Back in the popup's own step: it names the site and the member.
  await expect(popup.getByText('as embedfan?', { exact: false })).toBeVisible();
  await popup.getByLabel('Password').fill(MEMBER_PASSWORD);
  const closed = popup.waitForEvent('close');
  await popup.getByRole('button', { name: 'Allow', exact: true }).click();
  await closed;
  await expect(chat.getByRole('button', { name: 'Log out' })).toBeVisible();
  // No cookie from here on: the embed token alone carries the member.
  await hostContext.clearCookies();

  // The other member writes in General; from that name, a private message out of the embed.
  const hello = `hello from embedpal ${Date.now()}`;
  await pal.page.goto('/chat');
  await pal.page.getByLabel('Message', { exact: true }).fill(hello);
  await pal.page.getByRole('button', { name: 'Send' }).click();
  await chat
    .getByRole('list', { name: 'Messages in General' })
    .getByRole('listitem')
    .filter({ hasText: hello })
    .getByRole('button', { name: 'embedpal', exact: true })
    .click();
  await chat.getByRole('menuitem', { name: 'Send private message' }).click();
  const conversation = chat.getByRole('list', { name: 'Private messages with embedpal' });
  await expect(conversation).toBeVisible();
  await chat.getByLabel('Message', { exact: true }).fill(canary);
  await chat.getByRole('button', { name: 'Send' }).click();
  await expect(conversation.getByText(canary)).toBeVisible();

  // The other member reads it, and answers; the embed shows the answer, decrypted.
  await pal.page.getByRole('tab', { name: 'Direct' }).click();
  await pal.page.getByRole('button', { name: /^embedfan/ }).click();
  const palSide = pal.page.getByRole('list', { name: 'Private messages with embedfan' });
  await expect(palSide.getByText(canary)).toBeVisible();
  const answer = `answer-${canary}`;
  await pal.page.getByLabel('Message', { exact: true }).fill(answer);
  await pal.page.getByRole('button', { name: 'Send' }).click();
  await expect(conversation.getByText(answer)).toBeVisible();

  // The game page heard only the chat's own small messages, from this site.
  const heard = await host.evaluate(() => window.fromChat);
  expect(heard.length).toBeGreaterThan(0);
  expect(
    heard.every(([origin, data]) => origin === SERVER && data.source === 'seasonal-chat')
  ).toBe(true);
  expect(JSON.stringify(heard)).not.toContain(canary);

  // The site removed from the list: the embed is logged out at once.
  expect((await site('DELETE')).status()).toBe(200);
  await expect(chat.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await expect(chat.getByRole('tab', { name: /Direct/ })).toHaveCount(0);
  await admin.close();
});
