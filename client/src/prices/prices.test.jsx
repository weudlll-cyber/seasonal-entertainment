// ============================================================
// File:        prices.test.jsx
// Path:        client/src/prices/prices.test.jsx
// Project:     Seasonal Entertainment
// Description: Prices from the price bot (docs/BOTS.md): the home page's four season tiles
//              show each season's price and 24-hour change and open that coin's chart; without
//              the bot the tiles stay (no prices, no links) beside a "not connected" note;
//              /info/prices picks a token and a range and asks the server for exactly that;
//              pointing at the chart (or the arrow keys) reads a price at a local time;
//              the formats: four significant digits below $1 (seasons and POL alike), cents
//              from $1 on, signed percentages.
// ============================================================

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../app/App.jsx';
import { GUEST, mockApi } from '../test/mockApi.js';
import PricesPage from './PricesPage.jsx';
import { formatChange, formatUsd } from './priceFormat.js';

const AT = Date.parse('2026-10-21T12:00:00Z');
const latest = (token, price, change24h) => ({
  token,
  price,
  at: AT,
  change24h,
  spark: [price * 0.98, price * 1.01, price],
});
const PRICES = {
  ok: true,
  connected: true,
  prices: [
    latest('spring', 0.0027123, 0.0441),
    latest('summer', 0.0031, -0.0178),
    latest('autumn', 0.0025, 0),
    latest('winter', 0.00298, null),
  ],
};
const HOME = {
  ...GUEST,
  'GET /games': { body: { ok: true, games: [] } },
};
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

describe('home tiles', () => {
  it("shows each season's price and 24-hour change, each opening its coin's chart", async () => {
    mockApi({ ...HOME, 'GET /prices': { body: PRICES } });
    renderAt('/');
    const list = await screen.findByRole('list', { name: 'Prices in US dollars' });
    await within(list).findByText('$0.002712');
    const tiles = within(list).getAllByRole('link');
    expect(tiles.map((t) => t.textContent)).toEqual([
      'Spring$0.002712+4.41 % · 24 h',
      'Summer$0.003100−1.78 % · 24 h',
      'Autumn$0.002500±0.00 % · 24 h',
      'Winter$0.002980— · 24 h',
    ]);
    expect(tiles.map((t) => t.getAttribute('href'))).toEqual(
      ['spring', 'summer', 'autumn', 'winter'].map((id) => `/info/prices?coins=${id}`)
    );
    expect(screen.getByRole('link', { name: /^Fair price & charts/ })).toHaveAttribute(
      'href',
      '/info/prices'
    );
  });

  it('without the price bot: the tiles without prices or links, and a plain note', async () => {
    mockApi({ ...HOME, 'GET /prices': { body: { ok: true, connected: false, prices: [] } } });
    renderAt('/');
    expect(
      await screen.findByText(/Prices: the data source is not connected\./)
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Prices in US dollars' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).queryByRole('link')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Fair price & charts/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'About Seasonal Tokens' })).toHaveAttribute(
      'href',
      '/info'
    );
  });
});

describe('/info/prices', () => {
  const history = (token, range) => ({
    body: {
      ok: true,
      connected: true,
      token,
      range,
      points: [
        [Date.parse('2026-10-20T12:00:00Z'), 0.0026],
        [Date.parse('2026-10-21T00:00:00Z'), 0.0028],
        [Date.parse('2026-10-21T12:00:00Z'), 0.0027123],
      ],
    },
  });
  const ANSWERS = {
    ...GUEST,
    'GET /prices': { body: PRICES },
    'GET /prices/spring?range=7d': history('spring', '7d'),
    'GET /prices/spring?range=24h': history('spring', '24h'),
    'GET /prices/spring?range=30d': history('spring', '30d'),
    'GET /prices/winter?range=30d': history('winter', '30d'),
  };

  it('is the route under Seasonal Tokens, and asks for the picked coins and range', async () => {
    const calls = mockApi(ANSWERS);
    renderAt('/info/prices');
    expect(await screen.findByRole('img', { name: /^Spring price from/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(calls.map((c) => c.key)).toContain('GET /prices/spring?range=30d'));
    // Winter joins Spring on the chart, for the same range.
    fireEvent.click(screen.getByRole('button', { name: /^Winter/ }));
    expect(
      await screen.findByRole('img', { name: /^Comparison of Spring, Winter/ })
    ).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toContain('GET /prices/winter?range=30d');
    expect(screen.getByRole('button', { name: /^Winter/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pointing at the line, or the arrow keys, reads a price at a local time', async () => {
    mockApi(ANSWERS);
    render(
      <MemoryRouter>
        <PricesPage timeZone="Europe/Berlin" />
      </MemoryRouter>
    );
    const chart = await screen.findByRole('img', { name: /^Spring price from/ });
    chart.getBoundingClientRect = () => ({ left: 0, width: 640, top: 0, height: 260 });
    fireEvent.pointerMove(chart, { clientX: 630 });
    expect(screen.getByText('$0.002712 at 21 Oct 2026, 14:00')).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: 'Home' });
    expect(screen.getByText('$0.002600 at 20 Oct 2026, 14:00')).toBeInTheDocument();
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(screen.getByText('$0.002800 at 21 Oct 2026, 02:00')).toBeInTheDocument();
  });

  it('dates the time axis even for a day, where it starts and ends at the same hour', async () => {
    mockApi(ANSWERS);
    render(
      <MemoryRouter>
        <PricesPage timeZone="Europe/Berlin" />
      </MemoryRouter>
    );
    await screen.findByRole('img', { name: /^Spring price from/ });
    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
    expect(
      await screen.findByRole('img', {
        name: 'Spring price from 20 Oct 2026, 14:00 to 21 Oct 2026, 14:00',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('20 Oct 2026, 14:00')).toBeInTheDocument(); // the axis's first time
  });

  it('without the price bot, says so plainly', async () => {
    mockApi({ ...GUEST, 'GET /prices': { body: { ok: true, connected: false, prices: [] } } });
    renderAt('/info/prices');
    expect(
      await screen.findByText(
        'The price data source is not connected, so there are no prices to show.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

it('formats: four significant digits below $1, cents from $1 on, signed changes', () => {
  expect(formatUsd(0.0027123)).toBe('$0.002712');
  // Below $1 but above a cent (POL): four significant digits too, not cut to two decimals.
  expect(formatUsd(0.094195)).toBe('$0.09420');
  expect(formatUsd(0.5)).toBe('$0.5000');
  expect(formatUsd(1.5)).toBe('$1.50');
  expect(formatUsd(82445.0479)).toBe('$82,445.05');
  expect(formatUsd(undefined)).toBe('—');
  expect(formatChange(0.0441)).toBe('+4.41 %');
  expect(formatChange(-0.0178)).toBe('−1.78 %');
  expect(formatChange(null)).toBe('—');
});
