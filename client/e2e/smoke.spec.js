// ============================================================
// File:        smoke.spec.js
// Path:        client/e2e/smoke.spec.js
// Project:     Seasonal Entertainment
// Description: Browser smoke test: the landing page opens from the production server, has the
//              right title and the logo image actually loaded.
// ============================================================

import { expect, test } from '@playwright/test';

test('landing page opens with title and a loaded logo', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Seasonal Entertainment');

  const logo = page.getByAltText('Seasonal Entertainment logo');
  await expect(logo).toBeVisible();
  // naturalWidth is 0 when the image request failed or the file is not a decodable image.
  await expect
    .poll(() => logo.evaluate((img) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
});
