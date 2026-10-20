// ============================================================
// File:        fairAndConverter.test.jsx
// Path:        client/src/prices/fairAndConverter.test.jsx
// Project:     Seasonal Entertainment
// Description: The fair price table and the converter on /info/prices (FairPriceTable.jsx,
//              Converter.jsx; the arithmetic itself in fairPrice.test.js): the table with the
//              price bot's mining rates, ranked from best buy; a season-to-season conversion
//              with both mining times; a season into ETH with the season's only; ETH not offered
//              while it is not connected; without the mining rates both say so.
// ============================================================

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { GUEST, mockApi } from '../test/mockApi.js';
import Converter from './Converter.jsx';
import PricesPage from './PricesPage.jsx';

// The price bot's own test numbers (tests/test_fair_prices.py).
const RATES = { spring: 42, summer: 35, autumn: 60, winter: 52.5 };
const PRICES = { spring: 0.004, summer: 0.003, autumn: 0.005, winter: 0.004 };
const latest = (miningRates) => ({
  ok: true,
  connected: true,
  miningRates,
  prices: Object.entries(PRICES).map(([token, price]) => ({
    token,
    price,
    at: 1,
    change24h: 0,
    spark: [price, price],
  })),
});
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

function showPage(miningRates) {
  mockApi({
    ...GUEST,
    'GET /prices': { body: latest(miningRates) },
    'GET /prices/spring?range=7d': { body: HISTORY },
  });
  render(
    <MemoryRouter>
      <PricesPage timeZone="UTC" />
    </MemoryRouter>
  );
}

describe('fair price table', () => {
  it('each season: actual, fair, deviation, under/overpriced and rank from best buy', async () => {
    showPage(RATES);
    const table = await screen.findByRole('table');
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(rows).toEqual([
      'Spring$0.004000$0.004324−8 %underpriced2', // −7.5 % rounds to −8
      'Summer$0.003000$0.005189−42 %underpriced1 (best buy)',
      'Autumn$0.005000$0.003027+65 %overpriced4',
      'Winter$0.004000$0.003459+16 %overpriced3',
    ]);
    expect(screen.getByText(/fair price = K ÷ mining rate/)).toBeInTheDocument();
  });

  it('without the mining rates: says so, for the table and the mining times', async () => {
    showPage(null);
    expect(
      await screen.findByText('The mining rates are not available, so there is no fair price.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Mining times: the mining rates are not available.')
    ).toBeInTheDocument();
    expect(screen.getByText(/100 Summer ≈ 75 Winter/)).toBeInTheDocument(); // still converts
  });
});

describe('converter', () => {
  it('Summer into Winter: the amount at the price ratio and both mining times', async () => {
    showPage(RATES);
    await screen.findByRole('table');
    expect(screen.getByText('100 Summer ≈ 75 Winter')).toBeInTheDocument();
    expect(screen.getByText('Mining time (Summer): 2.86 hours')).toBeInTheDocument();
    expect(screen.getByText('Mining time (Winter): 1.43 hours')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '5000' } });
    // 5000 / 35 = 142.86 hours: the days are shown too.
    expect(screen.getByText('Mining time (Summer): 142.86 hours (6.0 days)')).toBeInTheDocument();
  });

  it('reference coins only while they are connected', async () => {
    showPage(RATES);
    await screen.findByRole('table');
    const from = screen.getByLabelText('From');
    expect(within(from).queryByRole('option', { name: 'ETH' })).toBeNull();
    expect(within(from).queryByRole('option', { name: 'BTC' })).toBeNull();
    expect(screen.getByText('Not connected, so not offered: ETH, POL, BTC.')).toBeInTheDocument();
  });

  it('every connected coin is offered; a tiny BTC amount keeps six significant digits', () => {
    render(<Converter prices={{ ...PRICES, eth: 2000, pol: 0.2, btc: 70000 }} rates={RATES} />);
    const to = screen.getByLabelText('To');
    expect(
      within(to)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Spring', 'Summer', 'Autumn', 'Winter', 'ETH', 'POL', 'BTC']);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'spring' } });
    fireEvent.change(to, { target: { value: 'btc' } });
    expect(screen.getByText('1,000 Spring ≈ 0.0000571429 BTC')).toBeInTheDocument();
    expect(screen.queryByText(/Not connected/)).toBeNull();
  });

  it('a season into ETH: the season has a mining time, ETH none', () => {
    render(<Converter prices={{ ...PRICES, eth: 2000 }} rates={RATES} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'autumn' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'eth' } });
    expect(screen.getByText('1,000 Autumn ≈ 0.0025 ETH')).toBeInTheDocument();
    expect(screen.getByText('Mining time (Autumn): 16.67 hours')).toBeInTheDocument();
    expect(screen.queryByText(/Mining time \(ETH\)/)).toBeNull();
  });
});
