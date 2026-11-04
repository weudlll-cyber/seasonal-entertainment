// ============================================================
// File:        discordConfirm.spec.js
// Path:        client/e2e/discordConfirm.spec.js
// Project:     Seasonal Entertainment
// Description: The Discord round trip in a real browser, against the run's Discord server (a
//              real server whose calls to Discord the pretend one answers, fakeDiscordPreload.mjs
//              and playwright.config.js): sign up with Discord, then, with the session's Discord
//              proof run out, "Confirm with Discord" on the chat page's Direct tab comes back to
//              the Direct tab (?tab=direct, client/src/pages/ChatPage.jsx), the proof fresh. And
//              with General open only from a step this member lacks (a rule of the test's own in
//              this server's database, removed afterwards), the chat page opens their first room
//              and a link to General says only "This room isn't available." (RoomPanel).
// ============================================================

import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DISCORD_SERVER_URL, FAKE_DISCORD_PORT, FAKE_DISCORD_USER } from './ports.js';

const DISCORD_DATABASE = path.join(process.env.SE_E2E_DIR, 'discord.db');
const LOCKED_ROLE = '1110000000000000777'; // a role the pretend member does not have

// One after the other: both log in as the same pretend member (the first run signs them up),
// and the second closes General on this server.
test.describe.configure({ mode: 'serial' });

// The site's start sends the browser to Discord's authorize page; here to the pretend one, which
// approves. Caught at the start: a route never sees the request a redirect leads to.
async function useFakeDiscord(page) {
  await page.route(`${DISCORD_SERVER_URL}/api/auth/discord/start?**`, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const to = new URL(response.headers().location);
    expect(to.origin).toBe('https://discord.com');
    return route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: `http://127.0.0.1:${FAKE_DISCORD_PORT}${to.pathname}${to.search}`,
      },
    });
  });
}

// As if the Discord login were older than its 10 minutes (server/src/accounts/identityProof.js).
function endDiscordProof(username) {
  const db = new Database(DISCORD_DATABASE);
  try {
    db.prepare(
      `UPDATE sessions SET sess = json_set(sess, '$.discordProofAt', 0)
       WHERE json_extract(sess, '$.userId') = (SELECT id FROM users WHERE username = ?)`
    ).run(username);
  } finally {
    db.close();
  }
}

// Logs in with Discord, landing on /chat: signs up the first time, a later login goes straight in.
async function logInWithDiscord(page) {
  await useFakeDiscord(page);
  await page.goto(`${DISCORD_SERVER_URL}/api/auth/discord/start?intent=login&next=%2Fchat`);
  await page.waitForURL(/\/(register\/discord|chat)/);
  if (page.url().includes('/register/discord')) {
    await page.getByLabel('Username').fill(FAKE_DISCORD_USER.username);
    await page.getByLabel(/I am at least/).check();
    await page.getByRole('button', { name: 'Create account' }).click();
  }
  await page.waitForURL(/\/chat$/);
}

// General open only from a step with LOCKED_ROLE (a step of the test's own), or open again.
function lockGeneral(locked) {
  const db = new Database(DISCORD_DATABASE);
  try {
    if (locked) {
      db.prepare(
        `INSERT OR IGNORE INTO discord_steps (ladder, name, position, role_id)
         VALUES ('holder', 'Locksmith', 98, ?)`
      ).run(LOCKED_ROLE);
      db.prepare(
        `INSERT OR IGNORE INTO room_step_rules (room_id, step_id)
         SELECT r.id, s.id FROM chat_rooms r, discord_steps s
         WHERE r.slug = 'general' AND s.role_id = ?`
      ).run(LOCKED_ROLE);
    } else {
      db.prepare(
        'DELETE FROM room_step_rules WHERE step_id IN (SELECT id FROM discord_steps WHERE role_id = ?)'
      ).run(LOCKED_ROLE);
      db.prepare('DELETE FROM discord_steps WHERE role_id = ?').run(LOCKED_ROLE);
    }
  } finally {
    db.close();
  }
}

test('"Confirm with Discord" on the Direct tab comes back to the Direct tab', async ({ page }) => {
  await logInWithDiscord(page);

  endDiscordProof(FAKE_DISCORD_USER.username);
  await page.reload();
  await expect(page.getByRole('tab', { name: /Rooms/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /Direct/ }).click();
  await expect(page).toHaveURL(/\/chat\?tab=direct$/);
  await page.getByRole('link', { name: 'Confirm with Discord' }).click();

  // Back from Discord: the Direct tab again, and the proof fresh, so the choice itself shows.
  await page.waitForURL(/\/chat\?tab=direct$/);
  await expect(page.getByRole('tab', { name: /Direct/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Save a recovery code' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Confirm with Discord' })).toHaveCount(0);
});

test.describe('General closed by a step the member lacks', () => {
  test.beforeAll(() => lockGeneral(true));
  test.afterAll(() => lockGeneral(false));

  test('the chat page opens their first room; a link to General gets the neutral note', async ({
    page,
  }) => {
    await logInWithDiscord(page);
    const rooms = page.getByRole('navigation', { name: 'Rooms' });
    const current = rooms.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(rooms.getByRole('button', { name: 'General', exact: true })).toHaveCount(0);
    await expect(rooms.getByRole('button').first()).toHaveAttribute('aria-current', 'page');
    const first = await current.textContent();
    await expect(page.getByRole('region', { name: `Chat: ${first}` })).toBeVisible();
    await expect(page.getByText('No such room.')).toHaveCount(0);
    await expect(page.getByText("This room isn't available.")).toHaveCount(0);

    // Closed or missing: the same note, the same first room.
    for (const slug of ['general', 'no-such-room']) {
      await page.goto(`${DISCORD_SERVER_URL}/chat?room=${slug}`);
      const panel = page.getByRole('region', { name: `Chat: ${first}` });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('status')).toHaveText("This room isn't available.");
      await expect(page.getByText('No such room.')).toHaveCount(0);
    }
  });
});
