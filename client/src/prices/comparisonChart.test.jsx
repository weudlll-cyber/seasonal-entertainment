// ============================================================
// File:        comparisonChart.test.jsx
// Path:        client/src/prices/comparisonChart.test.jsx
// Project:     Seasonal Entertainment
// Description: Several coins on the one chart of /info/prices (PriceChart.jsx,
//              PricesPage.jsx): the coins from the address and back into it; two or more
//              shown as % change since the range's start (each coin from its own first
//              point), titled "Comparison", with a 0 % line and a legend; the read-out gives
//              each coin's price and % change at the pointed time; the last coin cannot be
//              switched off; "All coins" and back; a coin without a price cannot be picked;
//              a gap in a coin's data leaves a gap in its line.
// ============================================================

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect, it } from 'vitest';
import { GUEST, mockApi } from '../test/mockApi.js';
import PricesPage from './PricesPage.jsx';
import { formatWhen } from '../app/dates.js';

// The site's one date format (app/dates.js), with plain spaces as the matchers compare text.
const at = (iso, zone) => formatWhen(iso, zone).replace(/\s/g, ' ');

const HOUR = 60 * 60_000;
const T0 = Date.parse('2026-10-20T12:00:00Z');
const card = (token, price) => ({ token, price, at: T0, change24h: 0, spark: [] });
const SEASONS = {
  ok: true,
  connected: true,
  miningRates: null,
  // Autumn has no price: its button cannot be picked.
  prices: [card('spring', 0.004), card('summer', 0.003), card('winter', 0.004)],
};
const REFERENCE = {
  ok: true,
  connected: true,
  prices: [card('eth', 2400), card('pol', 0.2), card('btc', 70000)],
};
// Three hourly points per coin: Spring +10 % then +20 %, ETH −5 % then +5 %.
const points = (base, a, b) => [
  [T0, base],
  [T0 + HOUR, base * a],
  [T0 + 2 * HOUR, base * b],
];
const answer = (token, pts) => ({
  body: { ok: true, connected: true, token, range: '7d', points: pts },
});
const HISTORIES = {
  'GET /prices/spring?range=7d': answer('spring', points(0.004, 1.1, 1.2)),
  'GET /prices/summer?range=7d': answer('summer', points(0.003, 1, 1)),
  'GET /prices/winter?range=7d': answer('winter', points(0.004, 1, 1)),
  'GET /reference-prices/eth?range=7d': answer('eth', points(2400, 0.95, 1.05)),
  'GET /reference-prices/pol?range=7d': answer('pol', points(0.2, 1, 1)),
  'GET /reference-prices/btc?range=7d': answer('btc', points(70000, 1, 1)),
};

// Shows the address the page keeps (MemoryRouter does not touch window.location).
function Address() {
  return <output aria-label="Address">{useLocation().search}</output>;
}

function showPage(path) {
  mockApi({
    ...GUEST,
    'GET /prices': { body: SEASONS },
    'GET /reference-prices': { body: REFERENCE },
    ...HISTORIES,
  });
  render(
    <MemoryRouter initialEntries={[path]}>
      <PricesPage timeZone="UTC" />
      <Address />
    </MemoryRouter>
  );
}
const coin = (name) =>
  within(screen.getByRole('group', { name: 'Coins' })).getByRole('button', {
    name: new RegExp(`^${name}`),
  });

it('two coins from the address: % change since the start, a 0 % line and a legend', async () => {
  showPage('/info/prices?coins=spring,eth');
  const chart = await screen.findByRole('img', { name: /^Comparison of Spring, ETH: % change/ });
  expect(screen.getByRole('heading', { name: 'Comparison' })).toBeInTheDocument();
  expect(
    screen.getByText(`% change since ${at('2026-10-20T12:00:00Z', 'UTC')}`)
  ).toBeInTheDocument();
  // The axis runs from ETH's −5 % to Spring's +20 %: each coin from its own first point.
  expect(screen.getByText('+20.00 %')).toBeInTheDocument();
  expect(screen.getByText('−5.00 %')).toBeInTheDocument();
  expect(chart.querySelector('.price-chart__zero')).not.toBeNull();
  expect(chart.querySelectorAll('path.coin--spring, path.coin--eth')).toHaveLength(2);
  const legend = screen.getByRole('list', { name: 'Legend' });
  expect(
    within(legend)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
  ).toEqual(['Spring', 'ETH']);
  expect(coin('Spring')).toHaveAttribute('aria-pressed', 'true');
  expect(coin('ETH')).toHaveAttribute('aria-pressed', 'true');
});

it("the read-out: each coin's price in US dollars and its % change at the pointed time", async () => {
  showPage('/info/prices?coins=spring,eth');
  const chart = await screen.findByRole('img', { name: /^Comparison/ });
  fireEvent.keyDown(chart, { key: 'End' });
  const readout = screen
    .getByText((text) => text.startsWith(`At ${at('2026-10-20T14:00:00Z', 'UTC')}`))
    .closest('figcaption');
  expect(
    within(readout)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
  ).toEqual(['Spring: $0.004800 (+20.00 %)', 'ETH: $2,520.00 (+5.00 %)']);
});

it('one coin: its price in US dollars, as before', async () => {
  showPage('/info/prices?coins=btc');
  expect(await screen.findByRole('img', { name: /^BTC price from/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'BTC' })).toBeInTheDocument();
  expect(screen.getByText('US dollars')).toBeInTheDocument();
  expect(screen.queryByText(/% change since/)).toBeNull();
});

it('picking coins changes the address; the last coin stays; a coin without price is off', async () => {
  showPage('/info/prices');
  await screen.findByRole('img', { name: /^Spring price from/ });
  fireEvent.click(coin('BTC'));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('?coins=spring%2Cbtc')
  );
  fireEvent.click(coin('Spring'));
  fireEvent.click(coin('BTC')); // the only one left: stays
  expect(await screen.findByRole('img', { name: /^BTC price from/ })).toBeInTheDocument();
  expect(coin('BTC')).toHaveAttribute('aria-pressed', 'true');
  expect(coin('Autumn')).toBeDisabled();
});

it('"All coins" shows every coin with a price; pressed again, the single coin from before', async () => {
  showPage('/info/prices?coins=eth');
  await screen.findByRole('img', { name: /^ETH price from/ });
  const all = within(screen.getByRole('group', { name: 'Coins' })).getByRole('button', {
    name: 'All coins',
  });
  fireEvent.click(all);
  const chart = await screen.findByRole('img', { name: /^Comparison of/ });
  expect(chart).toHaveAccessibleName(/Spring, Summer, Winter, ETH, POL, BTC/);
  expect(all).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(all);
  expect(await screen.findByRole('img', { name: /^ETH price from/ })).toBeInTheDocument();
});

it('an address with nothing valid shows Spring', async () => {
  showPage('/info/prices?coins=doge');
  expect(await screen.findByRole('img', { name: /^Spring price from/ })).toBeInTheDocument();
});

it('a coin with no data in part of the range has no line there', async () => {
  mockApi({
    ...GUEST,
    'GET /prices': { body: SEASONS },
    'GET /reference-prices': { body: REFERENCE },
    ...HISTORIES,
    // ETH: two points, then nothing for three days, then two more.
    'GET /reference-prices/eth?range=7d': answer('eth', [
      [T0, 2400],
      [T0 + HOUR, 2410],
      [T0 + 73 * HOUR, 2420],
      [T0 + 74 * HOUR, 2430],
    ]),
  });
  render(
    <MemoryRouter initialEntries={['/info/prices?coins=spring,eth']}>
      <PricesPage timeZone="UTC" />
    </MemoryRouter>
  );
  const chart = await screen.findByRole('img', { name: /^Comparison/ });
  const eth = chart.querySelector('path.coin--eth').getAttribute('d');
  expect(eth.match(/M/g)).toHaveLength(2); // two pieces, nothing drawn across the gap
});
