// ============================================================
// File:        games.spec.js
// Path:        client/e2e/games.spec.js
// Project:     Seasonal Entertainment
// Description: Browser flow through the real server (which adds "Seasonal Race" on its first
//              start): a guest sees the card as Coming soon, without a Play link, and its image
//              loads under the CSP.
// ============================================================

import { expect, test } from '@playwright/test';

test('a guest sees Seasonal Race as coming soon', async ({ page }) => {
  await page.goto('/games');
  const card = page.getByRole('listitem').filter({ hasText: 'Seasonal Race' });
  await expect(card).toContainText('Coming soon');
  await expect(card.getByRole('link')).toHaveCount(0);
  const image = card.locator('img');
  await expect
    .poll(() => image.evaluate((img) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
});
