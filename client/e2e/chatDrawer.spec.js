// ============================================================
// File:        chatDrawer.spec.js
// Path:        client/e2e/chatDrawer.spec.js
// Project:     Seasonal Entertainment
// Description: The chat drawer in a real browser: the chat button opens it over the page (the
//              page keeps its width), focus moves in; the room picker switches the room and the
//              chosen room's messages appear; Escape closes and focus returns to the button; a
//              reload keeps the open drawer and the room.
//              The message is a guest's: the run's one admin account is shared by the chat specs
//              running in parallel and has a per-sender limit, and registering would use up the
//              per-IP registration limit.
// ============================================================

import { expect, test } from '@playwright/test';
import { SERVER_PORT } from './ports.js';

const SERVER = `http://127.0.0.1:${SERVER_PORT}`;

test('open, switch room, Escape, reload', async ({ page, playwright }) => {
  // A message only the General room has, from a guest of its own.
  const guest = await playwright.request.newContext({
    baseURL: SERVER,
    extraHTTPHeaders: { Origin: SERVER },
  });
  const hello = `drawer hello ${Date.now()}`;
  expect(
    (await guest.post('/api/chat/rooms/general/messages', { data: { body: hello } })).status()
  ).toBe(201);
  await guest.dispose();

  // The drawer starts in Announcements, as if this browser had chosen it before.
  await page.goto('/games');
  await page.evaluate(() => localStorage.setItem('se.chatDrawer.room', 'announcements'));
  await page.reload();
  const main = page.locator('main');
  const before = await main.boundingBox();
  const button = page.getByRole('button', { name: 'Chat', exact: true });
  await button.click();
  const drawer = page.getByRole('dialog', { name: 'Chat' });
  await expect(drawer).toBeFocused();
  // Over the page: the main column keeps its size and place.
  expect(await main.boundingBox()).toEqual(before);
  await expect(drawer.getByText(hello)).toHaveCount(0);

  const picker = drawer.getByRole('button', { name: 'Room: Announcements' });
  await picker.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox', { name: 'Rooms' })).toBeFocused();
  await page.getByRole('option', { name: /General/ }).click();
  await expect(
    drawer.getByRole('list', { name: 'Messages in General' }).getByText(hello)
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(button).toBeFocused();

  await button.click();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Chat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Room: General' })).toBeVisible();
  await expect(page.getByText(hello)).toBeVisible();
});
