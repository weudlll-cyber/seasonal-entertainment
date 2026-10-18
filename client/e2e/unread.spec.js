// ============================================================
// File:        unread.spec.js
// Path:        client/e2e/unread.spec.js
// Project:     Seasonal Entertainment
// Description: The unread counters in real browsers (docs/CHAT.md, "Unread counters"): a
//              message from another member counts in both tabs of the reader, live, without
//              subscribing to that room; reading the room in one tab clears its count in the
//              other too. The test uses a room of its own (made through the admin API), since
//              other specs write in General at the same time.
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';
import { memberPage } from './members.js';

test('counts live in two tabs; reading in one clears both', async ({ browser, baseURL }) => {
  const admin = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const created = await admin.post('/api/admin/chat/rooms', {
    data: { slug: 'counters', name: 'Counters', readAccess: 'members', writeAccess: 'members' },
  });
  expect(created.status()).toBe(201);
  await admin.dispose();

  const reader = await memberPage(browser, 'unreadreader');
  const writer = await memberPage(browser, 'unreadwriter');
  await reader.page.goto('/games');
  const secondTab = await reader.page.context().newPage();
  await secondTab.goto('/chat');
  const rooms = secondTab.getByRole('navigation', { name: 'Rooms' });

  await writer.page.goto('/chat');
  await writer.page.getByRole('button', { name: 'Counters', exact: true }).click();
  await writer.page.getByLabel('Message', { exact: true }).fill(`for the counters ${Date.now()}`);
  await writer.page.getByRole('button', { name: 'Send' }).click();

  // Both tabs count it: the chat button's name in one, the room's own count in the other.
  await expect(
    reader.page.getByRole('button', { name: /^Chat: \d+ unread room messages?/ })
  ).toBeVisible();
  await expect(rooms.getByRole('img', { name: '1 unread in Counters' })).toBeVisible();

  // Reading Counters in the first tab moves the marker; the second tab hears of it.
  await reader.page.goto('/chat');
  await reader.page.getByRole('button', { name: 'Counters', exact: true }).click();
  await expect(rooms.getByRole('img', { name: '1 unread in Counters' })).toBeHidden();
});
