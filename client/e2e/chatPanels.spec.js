// ============================================================
// File:        chatPanels.spec.js
// Path:        client/e2e/chatPanels.spec.js
// Project:     Seasonal Entertainment
// Description: The chat module placed twice on one page: the test-only page (Vite dev server
//              only) shows two compact panels for two rooms; both receive their own room's new
//              messages live over a single WebSocket. The production server does not route
//              that page.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { DEV_PROXY_URL, SERVER_PORT } from './ports.js';

const SERVER = `http://127.0.0.1:${SERVER_PORT}`;

test.describe('through the Vite dev server', () => {
  test.use({ baseURL: DEV_PROXY_URL });

  test('two compact panels share one connection; each gets its own room', async ({
    page,
    playwright,
  }) => {
    const chatSockets = [];
    page.on('websocket', (ws) => {
      if (ws.url().endsWith('/ws/chat')) chatSockets.push(ws.url());
    });
    await page.goto('/test/chat-panels');
    const general = page.getByRole('region', { name: 'Chat: General' });
    const news = page.getByRole('region', { name: 'Chat: Announcements' });
    await expect(general.getByLabel('Message', { exact: true })).toBeVisible();
    await expect(news.getByText('You can read this room, but not write in it.')).toBeVisible();

    // Both messages come from elsewhere (the admin, straight to the server), so they can only
    // reach the panels over the live connection.
    const admin = await playwright.request.newContext({
      baseURL: SERVER,
      storageState: ADMIN_STATE,
      extraHTTPHeaders: { Origin: SERVER },
    });
    const stamp = Date.now();
    const say = (room, body) => admin.post(`/api/chat/rooms/${room}/messages`, { data: { body } });
    await expect(general.getByRole('list')).toBeVisible();
    await page.waitForTimeout(300); // both rooms subscribed
    expect((await say('general', `to general ${stamp}`)).status()).toBe(201);
    expect((await say('announcements', `to announcements ${stamp}`)).status()).toBe(201);

    await expect(general.getByText(`to general ${stamp}`)).toBeVisible();
    await expect(news.getByText(`to announcements ${stamp}`)).toBeVisible();
    await expect(general.getByText(`to announcements ${stamp}`)).toHaveCount(0);
    await expect(news.getByText(`to general ${stamp}`)).toHaveCount(0);
    expect(chatSockets).toHaveLength(1);
    await admin.dispose();
  });
});

test('the production build does not route the test page', async ({ page }) => {
  await page.goto('/test/chat-panels');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
