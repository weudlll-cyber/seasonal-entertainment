// ============================================================
// File:        referencePrices.test.jsx
// Path:        client/src/prices/referencePrices.test.jsx
// Project:     Seasonal Entertainment
// Description: The reference row on /info/prices (ETH and POL from CoinGecko through the
//              server, docs/BOTS.md): its cards with price and 24-hour change, CoinGecko's
//              required attribution beside them, their chart with the same range buttons, ETH in
//              the converter; without the key a plain "not connected"; the home price card stays
//              the four seasons only.
// ============================================================

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi } from '../test/mockApi.js';
import PricesPage from './PricesPage.jsx';

const card = (token, price, change24h) => ({ token, price, at: 1, change24h, spark: [] });
const SEASONS = {
  ok: true,
  connected: true,
  miningRates: { spring: 42, summer: 35, autumn: 60, winter: 52.5 },
  prices: [
    card('spring', 0.004, 0),
    card('summer', 0.003, 0),
    card('autumn', 0.005, 0),
    card('winter', 0.004, 0),
  ],
};
const REFERENCE = {
  ok: true,
  connected: true,
  prices: [card('eth', 2412.5, 0.0123), card('pol', 0.1834, -0.02), card('btc', 70250, 0.005)],
};
const history = (token, range) => ({
  body: {
    ok: true,
    connected: true,
    token,
    range,
    points: [
      [Date.parse('2026-10-20T12:00:00Z'), 2400],
      [Date.parse('2026-10-21T12:00:00Z'), 2412.5],
    ],
  },
});

function showPage({ seasons = SEASONS, reference = REFERENCE, path = '/info/prices' } = {}) {
  const calls = mockApi({
    ...GUEST,
    'GET /prices': { body: seasons },
    'GET /reference-prices': { body: reference },
    'GET /prices/spring?range=7d': history('spring', '7d'),
    'GET /reference-prices/eth?range=7d': history('eth', '7d'),
    'GET /reference-prices/eth?range=30d': history('eth', '30d'),
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <PricesPage timeZone="UTC" />
    </MemoryRouter>
  );
  return calls;
}

it('ETH and POL: price and 24-hour change, with CoinGecko named beside them', async () => {
  showPage();
  const row = await screen.findByRole('group', { name: 'Reference' });
  expect(within(row).getByRole('button', { name: /^ETH/ })).toHaveTextContent(
    'ETH$2,412.50+1.23 % (24 h)'
  );
  expect(within(row).getByRole('button', { name: /^POL/ })).toHaveTextContent(
    'POL$0.1834−2.00 % (24 h)'
  );
  const credit = screen.getByRole('link', { name: 'Powered by CoinGecko API' });
  expect(credit).toHaveAttribute('href', 'https://www.coingecko.com/en/api/');
  expect(credit).toHaveAttribute('rel', 'noopener noreferrer');
});

it("ETH's chart with the same range buttons, from the reference prices", async () => {
  const calls = showPage({ path: '/info/prices?coins=eth' });
  expect(await screen.findByRole('img', { name: /^ETH price from/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '30 days' }));
  await waitFor(() =>
    expect(calls.map((c) => c.key)).toContain('GET /reference-prices/eth?range=30d')
  );
});

it('the converter offers ETH while it is connected', async () => {
  showPage();
  await screen.findByRole('group', { name: 'Reference' });
  expect(within(screen.getByLabelText('To')).getByRole('option', { name: 'ETH' })).toBeTruthy();
  expect(screen.queryByText('ETH is not connected, so only the seasons.')).toBeNull();
});

it('without the key: ETH and POL are not connected; with no seasons either, no chart', async () => {
  showPage({
    seasons: { ok: true, connected: false, prices: [], miningRates: null },
    reference: { ok: true, connected: false, prices: [] },
  });
  expect(await screen.findByText('ETH, POL and BTC are not connected.')).toBeInTheDocument();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Powered by CoinGecko API' })).toBeNull();
});

it('the home price card stays the four seasons only', async () => {
  const calls = mockApi({
    ...GUEST,
    'GET /games': { body: { ok: true, games: [] } },
    'GET /prices': { body: SEASONS },
  });
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );
  const list = await screen.findByRole('list', { name: 'Prices in US dollars' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  expect(calls.map((c) => c.key)).not.toContain('GET /reference-prices');
});
