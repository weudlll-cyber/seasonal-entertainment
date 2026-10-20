// ============================================================
// File:        prices.spec.js
// Path:        client/e2e/prices.spec.js
// Project:     Seasonal Entertainment
// Description: /info/prices in a real browser (docs/BOTS.md). The test server has no price bot,
//              so the two price answers are stubbed in the browser. Checks what only a browser
//              computes: the converter's fields are named exactly "Amount", "From" and "To" (a
//              label wrapped around a select once named it after all its options), and a
//              conversion into ETH shows the season's mining time only.
// ============================================================

import { expect, test } from '@playwright/test';

const card = (token, price) => ({ token, price, at: 1, change24h: 0, spark: [price, price] });
const SEASONS = {
  ok: true,
  connected: true,
  miningRates: { spring: 42, summer: 35, autumn: 60, winter: 52.5 },
  prices: [
    card('spring', 0.004),
    card('summer', 0.003),
    card('autumn', 0.005),
    card('winter', 0.004),
  ],
};
const REFERENCE = { ok: true, connected: true, prices: [card('eth', 2000), card('pol', 0.2)] };
const HISTORY = {
  ok: true,
  connected: true,
  token: 'spring',
  range: '7d',
  points: [
    [1, 0.004],
    [2, 0.004],
  ],
};

test('the converter in a browser: exact field names; Autumn into ETH', async ({ page }) => {
  await page.route('**/api/prices', (route) => route.fulfill({ json: SEASONS }));
  await page.route('**/api/reference-prices', (route) => route.fulfill({ json: REFERENCE }));
  await page.route('**/api/prices/spring?range=7d', (route) => route.fulfill({ json: HISTORY }));
  await page.goto('/info/prices');

  const amount = page.getByLabel('Amount', { exact: true });
  const from = page.getByLabel('From', { exact: true });
  const to = page.getByLabel('To', { exact: true });
  await expect(page.getByText('100 Summer ≈ 75 Winter')).toBeVisible();
  await amount.fill('1000');
  await from.selectOption('autumn');
  await to.selectOption('eth');
  await expect(page.getByText('1,000 Autumn ≈ 0.0025 ETH')).toBeVisible();
  await expect(page.getByText('Mining time (Autumn): 16.67 hours')).toBeVisible();
  await expect(page.getByText(/Mining time \(ETH\)/)).toHaveCount(0);
});
