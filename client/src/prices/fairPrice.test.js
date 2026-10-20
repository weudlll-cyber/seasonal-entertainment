// ============================================================
// File:        fairPrice.test.js
// Path:        client/src/prices/fairPrice.test.js
// Project:     Seasonal Entertainment
// Description: The price bot's arithmetic, ported (fairPrice.js): the cases of the bot's
//              tests/test_fair_prices.py with their numbers (Summer, mined slowest, has the
//              highest fair price; fair prices inversely proportional to the rates; under- and
//              overpriced), the full table for those numbers worked out by hand, a missing
//              price, and the /swap conversion with its mining times: season to season, season
//              to ETH and to BTC, POL to a season, BTC to ETH.
// ============================================================

import { describe, expect, it } from 'vitest';
import { convert, fairPrices, fairTable, formatHours } from './fairPrice.js';

// The bot tests' numbers: rates (tokens per hour) and prices (US dollars).
const RATES = { spring: 42.0, summer: 35.0, autumn: 60.0, winter: 52.5 };
const PRICES = { spring: 0.004, summer: 0.003, autumn: 0.005, winter: 0.004 };

describe('fair prices, as the bot computes them', () => {
  it('test_compute_fair_prices_summer_highest: the lowest rate has the highest fair price', () => {
    const fair = fairPrices(PRICES, RATES);
    expect(fair.summer).toBeGreaterThan(fair.spring);
    expect(fair.spring).toBeGreaterThan(fair.winter);
    expect(fair.winter).toBeGreaterThan(fair.autumn);
  });

  it('test_compute_fair_prices_proportional: fairA / fairB = rateB / rateA', () => {
    const fair = fairPrices(PRICES, RATES);
    expect(Math.abs(fair.spring / fair.summer - RATES.summer / RATES.spring)).toBeLessThan(1e-10);
  });

  it('test_compare_prices_shows_underpriced_overpriced: equal rates, very different prices', () => {
    const rows = fairTable(
      { spring: 1.0, summer: 0.01, autumn: 0.01, winter: 0.0001 },
      { spring: 10, summer: 10, autumn: 10, winter: 10 }
    );
    expect(rows.find((r) => r.season === 'spring').underpriced).toBe(false);
    expect(rows.find((r) => r.season === 'winter').underpriced).toBe(true);
  });

  it('the whole table for the bot tests numbers, worked out by hand', () => {
    // avg actual = 0.004; avg 1/rate = (1/42 + 1/35 + 1/60 + 1/52.5) / 4 = 0.0220238…;
    // K = 0.004 / 0.0220238… = 0.181622…; fair = K / rate.
    const rows = Object.fromEntries(fairTable(PRICES, RATES).map((r) => [r.season, r]));
    expect(rows.spring.fair).toBeCloseTo(0.0043243, 6);
    expect(rows.summer.fair).toBeCloseTo(0.0051892, 6);
    expect(rows.autumn.fair).toBeCloseTo(0.003027, 6);
    expect(rows.winter.fair).toBeCloseTo(0.0034595, 6);
    expect(rows.spring.deviation).toBeCloseTo(-7.5, 1);
    expect(rows.summer.deviation).toBeCloseTo(-42.19, 1);
    expect(rows.autumn.deviation).toBeCloseTo(65.18, 1);
    expect(rows.winter.deviation).toBeCloseTo(15.63, 1);
    // Best buy first: the lowest actual / fair (summer 0.58, spring 0.93, winter 1.16, autumn 1.65).
    expect([rows.summer, rows.spring, rows.winter, rows.autumn].map((r) => r.rank)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(rows.summer.underpriced).toBe(true);
    expect(rows.autumn.underpriced).toBe(false);
  });

  it('a missing price: K over the priced seasons only; no row for it; none at all → empty', () => {
    const fair = fairPrices({ spring: 0.004, summer: 0.003 }, RATES);
    // K = 0.0035 / ((1/42 + 1/35) / 2) = 0.0035 / 0.0261905 = 0.133636…
    expect(fair.spring).toBeCloseTo(0.133636 / 42, 7);
    expect(fairTable({ spring: 0.004, summer: 0.003 }, RATES).map((r) => r.season)).toEqual([
      'spring',
      'summer',
    ]);
    expect(fairTable({}, RATES)).toEqual([]);
  });
});

describe('the converter, as /swap computes it', () => {
  it('100 Summer into Winter: converted at the price ratio, both mining times', () => {
    const result = convert(100, 'summer', 'winter', PRICES, RATES);
    expect(result.converted).toBeCloseTo(75, 10); // 100 × 0.003 / 0.004
    expect(result.hoursFrom).toBeCloseTo(100 / 35, 10); // 2.857 hours of Summer mining
    expect(result.hoursTo).toBeCloseTo(75 / 52.5, 10); // 1.429 hours of Winter mining
  });

  it('a season into ETH: only the season has a mining time', () => {
    const result = convert(1000, 'autumn', 'eth', { ...PRICES, eth: 2000 }, RATES);
    expect(result.converted).toBeCloseTo(0.0025, 12); // 1000 × 0.005 / 2000
    expect(result.hoursFrom).toBeCloseTo(1000 / 60, 10);
    expect(result.hoursTo).toBeNull();
  });

  it('1000 Spring into BTC: a few hundred-thousandths, Spring mined for 23.8 hours', () => {
    const result = convert(1000, 'spring', 'btc', { ...PRICES, btc: 70000 }, RATES);
    expect(result.converted).toBeCloseTo(0.0000571428571, 12); // 1000 × 0.004 / 70000
    expect(result.hoursFrom).toBeCloseTo(23.8095238, 6); // 1000 / 42
    expect(result.hoursTo).toBeNull(); // BTC is not mined here
  });

  it('50 POL into Summer: 3333.33 Summer, mined for 95.24 hours', () => {
    const result = convert(50, 'pol', 'summer', { ...PRICES, pol: 0.2 }, RATES);
    expect(result.converted).toBeCloseTo(3333.333333, 5); // 50 × 0.2 / 0.003
    expect(result.hoursFrom).toBeNull();
    expect(result.hoursTo).toBeCloseTo(95.2380952, 6); // 3333.33 / 35
  });

  it('0.5 BTC into ETH: 17.5 ETH, no mining time on either side', () => {
    const result = convert(0.5, 'btc', 'eth', { ...PRICES, btc: 70000, eth: 2000 }, RATES);
    expect(result).toEqual({ converted: 17.5, hoursFrom: null, hoursTo: null });
  });

  it('without mining rates: no mining times at all', () => {
    expect(convert(10, 'spring', 'summer', PRICES, null)).toMatchObject({
      hoursFrom: null,
      hoursTo: null,
    });
  });

  it('hours, with days once over 48 hours', () => {
    expect(formatHours(2.857)).toBe('2.86 hours');
    expect(formatHours(48)).toBe('48.00 hours');
    expect(formatHours(120)).toBe('120.00 hours (5.0 days)');
  });
});
