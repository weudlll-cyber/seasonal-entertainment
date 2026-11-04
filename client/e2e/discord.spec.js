// ============================================================
// File:        discord.spec.js
// Path:        client/e2e/discord.spec.js
// Project:     Seasonal Entertainment
// Description: Discord steps in a real browser (docs/CHAT.md, "Discord steps" and "Rooms for
//              Discord steps"; SE-DISCORD-1 piece 4). The run has no Discord: the link a Discord
//              login would store (role ids), a step of its own (Gilded, Holder ladder; the run
//              does not depend on the steps the project ships) and a room open from it are
//              written straight into the run's database, as members.js does with accounts.
//              Then: the badge after
//              the name of a member with a step, its tooltip on hover and on a tap, the full
//              name in the name menu; the room listed, readable and writable for that member and
//              not for one without the step.
// ============================================================

import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { E2E_DATABASE, memberPage } from './members.js';

// Each member logs in once per worker (pages shared by the tests below), not once per test.
test.describe.configure({ mode: 'serial' });
let whale;
let other;

const GILDED_ROLE = '1110000000000000004';

// A step Gilded with its role id (the run's own, beside the shipped seed), stepwhale a link
// carrying it, and a room "Whales" opens from Gilded on. Safe to run twice (--repeat-each).
test.beforeAll(() => {
  const db = new Database(E2E_DATABASE);
  try {
    db.prepare(
      `INSERT OR IGNORE INTO discord_steps (ladder, name, position, role_id)
       VALUES ('holder', 'Gilded', 99, ?)`
    ).run(GILDED_ROLE);
    const whale = db.prepare("SELECT id FROM users WHERE username = 'stepwhale'").get().id;
    db.prepare(
      `INSERT OR IGNORE INTO discord_links (user_id, discord_id, discord_name, status, role_ids,
         linked_at, next_refresh_at)
       VALUES (?, '500000000000000001', 'stepwhale', 'member', ?, 'now', '2999-01-01')`
    ).run(whale, JSON.stringify([GILDED_ROLE]));
    db.prepare(
      `INSERT OR IGNORE INTO chat_rooms (slug, name, read_access, write_access, position)
       VALUES ('whales', 'Whales', 'members', 'members', 99)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO room_step_rules (room_id, step_id)
       SELECT r.id, s.id FROM chat_rooms r, discord_steps s
       WHERE r.slug = 'whales' AND s.role_id = ?`
    ).run(GILDED_ROLE);
  } finally {
    db.close();
  }
});

test.beforeAll(async ({ browser }) => {
  ({ page: whale } = await memberPage(browser, 'stepwhale'));
  ({ page: other } = await memberPage(browser, 'stepnone'));
});

test.afterAll(async () => {
  await whale?.context().close();
  await other?.context().close();
});

test('a member with a step: the badge, its tooltip, the name menu', async () => {
  await whale.goto('/chat');
  const text = `gm whales ${Date.now()}`;
  await whale.getByLabel('Message', { exact: true }).fill(text);
  await whale.getByRole('button', { name: 'Send' }).click();

  await other.goto('/chat');
  const message = other.getByRole('listitem').filter({ hasText: text });
  const badge = message.getByRole('button', { name: 'Discord steps: Gilded' });
  await expect(badge).toBeVisible();
  // The placeholder until an icon is uploaded: Gilded's initial in the round Holder shape.
  await expect(badge.locator('.step-icon--placeholder.step-icon--holder')).toHaveText('G');
  const tip = badge.getByRole('tooltip');
  await expect(tip).toBeHidden();
  await badge.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Gilded');
  // A tap (touch screens have no hover) opens it as well.
  await other.mouse.move(0, 0);
  await badge.click();
  await expect(badge).toHaveAttribute('aria-expanded', 'true');
  await expect(tip).toBeVisible();

  await message.getByRole('button', { name: 'stepwhale', exact: true }).click();
  const menu = other.getByRole('menu', { name: 'stepwhale' });
  await expect(menu).toContainText('Gilded · Holder');
  await expect(menu.getByRole('menuitem', { name: 'Send private message' })).toBeFocused();
  await other.keyboard.press('Escape');
});

test('a room for steps: open with the step, closed without', async () => {
  await whale.goto('/chat');
  await whale.getByRole('button', { name: 'Whales', exact: true }).click();
  const text = `inside ${Date.now()}`;
  await whale.getByLabel('Message', { exact: true }).fill(text);
  await whale.getByRole('button', { name: 'Send' }).click();
  await expect(
    whale.getByRole('list', { name: 'Messages in Whales' }).getByText(text)
  ).toBeVisible();

  await other.goto('/chat');
  await expect(other.getByRole('button', { name: 'General', exact: true })).toBeVisible();
  await expect(other.getByRole('button', { name: 'Whales', exact: true })).toHaveCount(0);
  const read = await other.request.get('/api/chat/rooms/whales/messages');
  expect(read.status()).toBe(404);
});
