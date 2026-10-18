// ============================================================
// File:        roomRows.spec.js
// Path:        client/e2e/roomRows.spec.js
// Project:     Seasonal Entertainment
// Description: The full chat's room list in a real browser (docs/DESIGN.md, "Chat page"): at
//              1440 x 900 and 1280 x 720 every room is one row — the stars of all rows share
//              one x position, the bells another, no row is taller than one line (a long name
//              is cut with an ellipsis, not wrapped) and no toggle reaches into the message
//              panel. Besides the seeded rooms (General, Seasonal Race, Organisers,
//              Announcements) it makes one with a name too long for the column (admin API).
// ============================================================

import { expect, request as newRequest, test } from '@playwright/test';
import { ADMIN_STATE } from './adminState.js';

// Signed in as the run's admin: a member, so every row has its star and bell.
test.use({ storageState: ADMIN_STATE });

const LONG_ROOM = { slug: 'race-results', name: 'Seasonal Race Results and Announcements' };
const SIZES = [
  [1440, 900],
  [1280, 720],
];
// A row is one line: the 44px hit areas, plus a pixel of rounding.
const ROW_MAX = 45;

// One test for both sizes: the room is made once (a second worker would get a conflict).
test('room rows line up at 1440 x 900 and 1280 x 720', async ({ page, baseURL }) => {
  const admin = await newRequest.newContext({
    baseURL,
    storageState: ADMIN_STATE,
    extraHTTPHeaders: { Origin: baseURL },
  });
  const created = await admin.post('/api/admin/chat/rooms', {
    data: { ...LONG_ROOM, readAccess: 'members', writeAccess: 'members' },
  });
  expect(created.status()).toBe(201);
  await admin.dispose();

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto('/chat');
    const rooms = page.getByRole('navigation', { name: 'Rooms' });
    await expect(rooms.getByRole('button', { name: `Mute: ${LONG_ROOM.name}` })).toBeVisible();

    const boxes = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect().toJSON();
      const rows = [...document.querySelectorAll('.chat-rooms__item')];
      return {
        rows: rows.map((row) => ({
          row: box(row),
          name: box(row.querySelector('.chat-room')),
          star: box(row.querySelector('.chat-toggle--star')),
          bell: box(row.querySelector('.chat-toggle--bell')),
        })),
        messages: box(document.querySelector('.chat-conversation')),
      };
    });
    expect(boxes.rows.length).toBeGreaterThanOrEqual(5);
    const xs = (part) => new Set(boxes.rows.map((r) => Math.round(r[part].x)));
    expect(xs('star').size, `stars in one column at ${width}`).toBe(1);
    expect(xs('bell').size, `bells in one column at ${width}`).toBe(1);
    for (const r of boxes.rows) {
      expect(r.row.height).toBeLessThanOrEqual(ROW_MAX);
      expect(r.name.height).toBeLessThanOrEqual(ROW_MAX);
      expect(r.star.right).toBeLessThanOrEqual(boxes.messages.left);
      expect(r.bell.right).toBeLessThanOrEqual(boxes.messages.left);
    }
    // The long name is cut, and the full name stays in its title and accessible name.
    const long = rooms.getByRole('button', { name: LONG_ROOM.name, exact: true });
    await expect(long).toHaveAttribute('title', LONG_ROOM.name);
  }
});
