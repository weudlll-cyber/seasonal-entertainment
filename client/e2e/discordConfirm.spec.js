// ============================================================
// File:        discordConfirm.spec.js
// Path:        client/e2e/discordConfirm.spec.js
// Project:     Seasonal Entertainment
// Description: The Discord round trip in a real browser, against the run's Discord server (a
//              real server whose calls to Discord the pretend one answers, fakeDiscordPreload.mjs
//              and playwright.config.js): sign up with Discord, then, with the session's Discord
//              proof run out, "Confirm with Discord" on the chat page's Direct tab comes back to
//              the Direct tab (?tab=direct, client/src/pages/ChatPage.jsx), the proof fresh.
// ============================================================

import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DISCORD_SERVER_URL, FAKE_DISCORD_PORT, FAKE_DISCORD_USER } from './ports.js';

const DISCORD_DATABASE = path.join(process.env.SE_E2E_DIR, 'discord.db');

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

test('"Confirm with Discord" on the Direct tab comes back to the Direct tab', async ({ page }) => {
  await useFakeDiscord(page);
  // Sign up with Discord (a repeated run finds the account and logs straight in).
  await page.goto(`${DISCORD_SERVER_URL}/api/auth/discord/start?intent=login&next=%2Fchat`);
  await page.waitForURL(/\/(register\/discord|chat)/);
  if (page.url().includes('/register/discord')) {
    await page.getByLabel('Username').fill(FAKE_DISCORD_USER.username);
    await page.getByLabel(/I am at least/).check();
    await page.getByRole('button', { name: 'Create account' }).click();
  }
  await page.waitForURL(/\/chat$/);

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
