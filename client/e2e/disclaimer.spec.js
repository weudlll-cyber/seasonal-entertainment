// ============================================================
// File:        disclaimer.spec.js
// Path:        client/e2e/disclaimer.spec.js
// Project:     Seasonal Entertainment
// Description: "Not financial advice" in the sidebar footer (next to Imprint and Privacy) on
//              every main route, for a guest at the smallest desktop size the home page must
//              fit (1280 x 720); it opens the Disclaimer, published from the first start on.
// ============================================================

import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/games', '/events', '/chat', '/calls', '/info', '/info/prices'];

test.use({ viewport: { width: 1280, height: 720 } });

test('every main route links "Not financial advice" to the published Disclaimer', async ({
  page,
}) => {
  for (const route of ROUTES) {
    await page.goto(route);
    const link = page
      .getByRole('navigation', { name: 'Legal' })
      .getByRole('link', { name: 'Not financial advice' });
    await expect(link, route).toBeVisible();
    await expect(link, route).toHaveAttribute('href', '/info/disclaimer');
  }
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Not financial advice' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Disclaimer' })).toBeVisible();
  await expect(page.getByText(/not financial, investment, legal or tax advice/)).toBeVisible();
});
