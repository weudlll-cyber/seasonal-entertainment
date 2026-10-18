// ============================================================
// File:        embed.spec.js
// Path:        client/e2e/embed.spec.js
// Project:     Seasonal Entertainment
// Description: The embedded chat in a real browser, under the server's real headers: a page
//              of this site frames /embed/chat (the chat shows, nothing else of the site);
//              no other page of the site can be framed; a page on another origin cannot frame
//              the embed either (frame-ancestors). Through the Vite dev server, the test-only
//              demo page receives the embed's ready and unread messages.
// ============================================================

import { expect, test } from '@playwright/test';
import { DEV_PROXY_URL, SERVER_PORT } from './ports.js';

const SERVER = `http://127.0.0.1:${SERVER_PORT}`;

// Puts an iframe of `src` into the current page; returns its frame once it has loaded.
async function frameOf(page, src) {
  await page.evaluate((url) => {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'framed';
    document.body.append(frame);
  }, src);
  const element = page.locator('iframe[title="framed"]').last();
  await expect(element).toBeAttached();
  const frame = await (await element.elementHandle()).contentFrame();
  await frame.waitForLoadState();
  return frame;
}

// A frame the browser refused to show (frame-ancestors) ends on its error page.
const refused = (frame) => frame.url().startsWith('chrome-error://');

test('a page of this site frames the chat; other pages cannot be framed', async ({ page }) => {
  await page.goto('/events');
  const chat = await frameOf(page, '/embed/chat?room=general&theme=dark');
  expect(refused(chat)).toBe(false);
  await expect(chat.getByRole('region', { name: 'Chat: General' })).toBeVisible();
  await expect(chat.getByRole('banner')).toHaveCount(0);
  await expect(chat.locator('html')).toHaveAttribute('data-theme', 'dark');

  const events = await frameOf(page, '/events');
  expect(refused(events)).toBe(true);
});

test('a page on another origin cannot frame the chat', async ({ page }) => {
  // The dev server's port is another origin than the site's.
  await page.goto(`${DEV_PROXY_URL}/events`);
  const chat = await frameOf(page, `${SERVER}/embed/chat?room=general`);
  expect(refused(chat)).toBe(true);
});

test.describe('through the Vite dev server', () => {
  test.use({ baseURL: DEV_PROXY_URL });

  test('the demo page hears ready and the unread count', async ({ page }) => {
    await page.goto('/test/embed-chat');
    const log = page.getByRole('list', { name: 'Messages from the chat' });
    await expect(log).toContainText('"type":"ready"');
    await expect(log).toContainText('"signedIn":false');
    await expect(log).toContainText('"type":"unread","room":"general","count":0');
  });
});
