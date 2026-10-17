// ============================================================
// File:        chatMedia.spec.js
// Path:        client/e2e/chatMedia.spec.js
// Project:     Seasonal Entertainment
// Description: Through the real page: a signed-in account sends a sticker, then text plus a
//              GIF as one message, from the seeded library; a second viewer (a guest) sees
//              both arrive live, loaded
//              from this site. The guest's picker offers only Emoji. The sender is the run's
//              admin (globalSetup): registering one more account would hit the per-IP
//              registration limit shared by all specs.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

// Attaches a sticker or GIF, adds optional text, and sends both as one message.
async function sendWith(page, tab, alt, text = '') {
  await page.getByRole('button', { name: 'Emoji, stickers, GIFs' }).click();
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('button', { name: alt }).click();
  await expect(page.getByRole('group', { name: 'Attachment' })).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('group', { name: 'Attachment' })).toHaveCount(0);
}

const loaded = (image) => image.evaluate((img) => img.complete && img.naturalWidth > 0);

test('a signed-in account sends a sticker and a GIF; another viewer sees both', async ({
  browser,
}) => {
  const member = await (await browser.newContext({ storageState: ADMIN_STATE })).newPage();
  const viewer = await (await browser.newContext()).newPage();
  await member.goto('/chat');
  await viewer.goto('/chat');

  await viewer.getByRole('button', { name: 'Emoji' }).click();
  await expect(viewer.getByRole('tab')).toHaveText(['Emoji']);
  await expect(viewer.getByText('Log in to send stickers and GIFs.')).toBeVisible();

  await sendWith(member, 'Stickers', 'Spring season badge');
  const text = `welcome ${Date.now()}`;
  await sendWith(member, 'GIFs', 'Animated title: Welcome to Seasonal Tokens', text);

  const list = viewer.getByRole('list', { name: 'Messages in General' });
  const sticker = list.getByRole('img', { name: 'Spring season badge' }).last();
  // Text and GIF arrive together, as one message.
  const gifMessage = list.getByRole('listitem').filter({ hasText: text });
  const gif = gifMessage.getByRole('img', { name: 'Animated title: Welcome to Seasonal Tokens' });
  await expect(sticker).toBeVisible();
  await expect(gif).toBeVisible();
  await expect.poll(() => loaded(sticker)).toBe(true);
  await expect.poll(() => loaded(gif)).toBe(true);
  expect(await sticker.getAttribute('src')).toMatch(/^\/media\/[0-9a-f]{32}\.webp$/);
});
