// ============================================================
// File:        accountNarrow.spec.js
// Path:        client/e2e/accountNarrow.spec.js
// Project:     Seasonal Entertainment
// Description: The account page on a phone (decided 2026-11-13; docs/DESIGN.md "Account
//              page"): at 360 x 740 and 390 x 844, light and dark, with every section closed and
//              then with every section open, nothing scrolls sideways, every section's heading
//              button is a 44px target inside the window with its title and status inside it,
//              and "Log out" stays inside the window. The keyboard opens a section (Enter on
//              its focused heading) with the focus ring showing.
// ============================================================

import { expect, test } from '@playwright/test';
import { openSection } from './accountSections.js';
import { memberPage } from './members.js';

const SIZES = [
  [360, 740],
  [390, 844],
];
const SCHEMES = ['light', 'dark'];
const SECTIONS = [
  'Profile',
  'Sign-in & security',
  'Private messages',
  'Privacy',
  'Notifications',
  'Delete my account',
];

// The page's sideways overflow, and the heading buttons (and "Log out") that are too short,
// past the window's edge, or whose text is wider than their box.
const measure = (page) =>
  page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.disclosure__button')];
    const logOut = [...document.querySelectorAll('.account-summary button')];
    const right = (el) => el.getBoundingClientRect().right;
    const name = (el) => el.textContent.trim();
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      count: buttons.length,
      // By their text, so a failure names them.
      short: buttons.filter((b) => b.getBoundingClientRect().height < 44).map(name),
      outside: [...buttons, ...logOut].filter((b) => right(b) > window.innerWidth + 0.5).map(name),
      spilling: buttons.filter((b) => b.scrollWidth > b.clientWidth + 1).map(name),
    };
  });

test('the account page fits a phone, closed and open, light and dark', async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await memberPage(browser, 'accountphone');
  await page.goto('/account');
  for (const [width, height] of SIZES) {
    for (const colorScheme of SCHEMES) {
      await page.setViewportSize({ width, height });
      // Reduced motion: the chevron turns at once, so no box is measured mid-turn (a turning
      // chevron is wider for 0.15 s).
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const at = `${width} x ${height}, ${colorScheme}`;
      for (const state of ['closed', 'open']) {
        if (state === 'open') for (const title of SECTIONS) await openSection(page, title);
        await expect(
          page.getByRole('button', { name: /^Delete my account/ }).first()
        ).toBeVisible();
        expect(await measure(page), `${at}, all ${state}`).toEqual({
          sideways: 0,
          count: 6,
          short: [],
          outside: [],
          spilling: [],
        });
      }
      // Closed again for the next size (the browser remembers the member's choice).
      for (const title of SECTIONS) {
        const button = page.locator('.disclosure__button', { hasText: title });
        if ((await button.getAttribute('aria-expanded')) === 'true') await button.click();
      }
    }
  }
});

test('the keyboard opens a section, with the focus ring showing', async ({ browser }) => {
  const { page } = await memberPage(browser, 'accountphone');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/account');
  const privacy = page.locator('.disclosure__button', { hasText: 'Privacy' });
  await expect(privacy).toHaveAttribute('aria-expanded', 'false');
  await privacy.focus();
  await page.keyboard.press('Enter');
  await expect(privacy).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: 'Privacy' })).toBeVisible();
  // Keyboard focus is drawn (styles/base.css :focus-visible).
  expect(await privacy.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Space');
  await expect(privacy).toHaveAttribute('aria-expanded', 'false');
});
