// ============================================================
// File:        profiles.spec.js
// Path:        client/e2e/profiles.spec.js
// Project:     Seasonal Entertainment
// Description: Member profiles in real browsers (docs/AUTH.md, "Member profiles"): a member
//              writes About me (a web address in it) and uploads a picture on the account page;
//              another member reaches the profile from the name's menu in a chat room and from
//              the member search, sees the picture and About me with the address as plain text,
//              and "Send message" opens the direct conversation; a guest gets the sign-in page;
//              at 360 and 390 px the profile page scrolls no sideways and its buttons are 44 px
//              targets.
// ============================================================

import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { memberPage } from './members.js';

const ABOUT = `Racing since season one ${Date.now()}. Notes: https://example.org/me`;

test('a profile: written on the account page, reached from chat, a message from it', async ({
  browser,
}) => {
  const { page: one } = await memberPage(browser, 'profileone');
  const { page: two } = await memberPage(browser, 'profiletwo');

  // profileone writes About me and uploads a picture, then says hello in General.
  await one.goto('/account');
  await one.getByRole('textbox', { name: /About me/ }).fill(ABOUT);
  await one.getByRole('button', { name: 'Save About me' }).click();
  await expect(one.getByText('Saved.')).toBeVisible();
  const picture = await sharp({
    create: { width: 120, height: 120, channels: 3, background: '#04aaf7' },
  })
    .png()
    .toBuffer();
  await one
    .getByLabel('Profile picture file')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: picture });
  await expect(one.getByRole('img', { name: 'Your profile picture' })).toBeVisible();
  await one.goto('/chat');
  const hello = `hello from profileone ${Date.now()}`;
  await one.getByLabel('Message', { exact: true }).fill(hello);
  await one.getByRole('button', { name: 'Send' }).click();

  // profiletwo: the name's menu in the room opens the profile.
  await two.goto('/chat');
  await two
    .getByRole('list', { name: 'Messages in General' })
    .getByRole('listitem')
    .filter({ hasText: hello })
    .getByRole('button', { name: 'profileone', exact: true })
    .click();
  await two.getByRole('menuitem', { name: 'View profile' }).click();
  await expect(two).toHaveURL(/\/members\/profileone$/);
  await expect(two.getByRole('heading', { name: 'profileone', level: 1 })).toBeVisible();
  const about = two.getByText(ABOUT);
  await expect(about).toBeVisible();
  await expect(about.getByRole('link')).toHaveCount(0);
  const shown = two.getByRole('img', { name: 'Profile picture of profileone' });
  await expect(shown).toBeVisible();
  // Loaded, not only placed: under load the picture may still be on its way.
  await expect.poll(() => shown.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  // "Send message": the chat drawer opens that conversation.
  await two.getByRole('button', { name: 'Send message' }).click();
  await expect(two.getByRole('list', { name: 'Private messages with profileone' })).toBeVisible();

  // The member search leads there too.
  await two.goto('/chat');
  await two.getByRole('tab', { name: 'Direct' }).click();
  await two.getByRole('combobox', { name: 'Find a member' }).fill('profileo');
  await two.getByRole('button', { name: 'Profile of profileone' }).click();
  await expect(two).toHaveURL(/\/members\/profileone$/);
});

test('a guest gets the sign-in page', async ({ page }) => {
  await page.goto('/members/profileone');
  await expect(page).toHaveURL(/\/login\?next=%2Fmembers%2Fprofileone/);
});

// On a phone (decided 2026-11-11): nothing sideways, every button a 44px target.
for (const [width, height] of [
  [360, 740],
  [390, 844],
]) {
  test(`${width} x ${height}: the profile page fits a phone`, async ({ browser }) => {
    const { page } = await memberPage(browser, 'profiletwo');
    await page.setViewportSize({ width, height });
    await page.goto('/members/profileone');
    await expect(page.getByRole('heading', { name: 'profileone', level: 1 })).toBeVisible();
    // Neither the page nor anything on the profile reaches past the window's right edge (the
    // main column clips what is wider, so the page alone would not show it).
    const past = await page.evaluate(() => [
      document.documentElement.scrollWidth - window.innerWidth,
      ...[...document.querySelectorAll('.member-profile, .member-profile *')].map(
        (el) => el.getBoundingClientRect().right - window.innerWidth
      ),
    ]);
    expect(Math.max(...past)).toBeLessThanOrEqual(0);
    for (const button of await page.locator('.member-profile__actions .button').all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  });
}
