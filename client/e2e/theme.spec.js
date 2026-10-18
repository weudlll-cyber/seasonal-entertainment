// ============================================================
// File:        theme.spec.js
// Path:        client/e2e/theme.spec.js
// Project:     Seasonal Entertainment
// Description: The theme in a real browser: a dark system setting gives html[data-theme=dark]
//              already at DOMContentLoaded, set by public/theme-init.js alone (the app bundle
//              blocked); the toggle's choice survives a reload; with storage blocked the page
//              still renders, in the system theme.
// ============================================================

import { expect, test } from '@playwright/test';

const themeAtDomReady = () =>
  document.addEventListener('DOMContentLoaded', () => {
    window.themeAtDomReady = document.documentElement.dataset.theme;
  });

test('dark system setting: dark before the app runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(themeAtDomReady);
  await page.goto('/');
  expect(await page.evaluate(() => window.themeAtDomReady)).toBe('dark');

  // Without the app bundle only the early script can have set it.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'dark'
  );
});

test('the toggle choice is kept across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.addInitScript(themeAtDomReady);
  await page.reload();
  expect(await page.evaluate(() => window.themeAtDomReady)).toBe('dark');
});

test('storage blocked: the page renders in the system theme', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light theme' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});
