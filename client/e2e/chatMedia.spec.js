// ============================================================
// File:        chatMedia.spec.js
// Path:        client/e2e/chatMedia.spec.js
// Project:     Seasonal Entertainment
// Description: Through the real page: a signed-in account sends a sticker and a GIF from the
//              seeded library, and a second viewer (a guest) sees both arrive live, loaded
//              from this site. The guest's picker offers only Emoji. The sender is the run's
//              admin (globalSetup): registering one more account would hit the per-IP
//              registration limit shared by all specs.
// ============================================================

import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

async function pick(page, tab, alt) {
  await page.getByRole('button', { name: 'Emoji, stickers, GIFs' }).click();
  await page.getByRole('tab', { name: tab }).click();
  await page.getByRole('button', { name: alt }).click();
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

  await pick(member, 'Stickers', 'Spring season badge');
  await pick(member, 'GIFs', 'Animated title: Welcome to Seasonal Tokens');

  const list = viewer.getByRole('list', { name: 'Messages in General' });
  const sticker = list.getByRole('img', { name: 'Spring season badge' }).last();
  const gif = list.getByRole('img', { name: 'Animated title: Welcome to Seasonal Tokens' }).last();
  await expect(sticker).toBeVisible();
  await expect(gif).toBeVisible();
  await expect.poll(() => loaded(sticker)).toBe(true);
  await expect.poll(() => loaded(gif)).toBe(true);
  expect(await sticker.getAttribute('src')).toMatch(/^\/media\/[0-9a-f]{32}\.webp$/);
});
