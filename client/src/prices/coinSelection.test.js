// ============================================================
// File:        coinSelection.test.js
// Path:        client/src/prices/coinSelection.test.js
// Project:     Seasonal Entertainment
// Description: Which coins the chart shows (coinSelection.js) and its geometry for several
//              lines (chartGeometry.js): the address read in button order with Spring as the
//              fallback; coins without a price never shown; toggling keeps at least one; "All"
//              and its way back; one scale shared by every line; no line across a gap.
// ============================================================

import { describe, expect, it } from 'vitest';
import { gapsIn, linePath, scaleSeries } from './chartGeometry.js';
import { parseCoins, shownCoins, toggleAll, toggleCoin } from './coinSelection.js';

const ALL = ['spring', 'summer', 'autumn', 'winter', 'eth', 'pol', 'btc'];

describe('coins from the address', () => {
  it('known coins in button order, any case, each once', () => {
    expect(parseCoins('btc,Spring, eth,spring')).toEqual(['spring', 'eth', 'btc']);
  });

  it('nothing valid, or nothing at all: Spring', () => {
    expect(parseCoins('doge,<script>')).toEqual(['spring']);
    expect(parseCoins(null)).toEqual(['spring']);
  });

  it('only coins with a price; none of them: Spring, else the first available', () => {
    expect(shownCoins(['spring', 'btc'], ['spring', 'summer'])).toEqual(['spring']);
    expect(shownCoins(['btc'], ALL)).toEqual(['btc']);
    expect(shownCoins(['btc'], ['spring', 'summer'])).toEqual(['spring']);
    expect(shownCoins(['spring'], ['eth', 'pol'])).toEqual(['eth']);
  });
});

describe('picking coins', () => {
  it('a button adds its coin (in button order) or takes it away; the last one stays', () => {
    expect(toggleCoin(['eth'], 'spring')).toEqual(['spring', 'eth']);
    expect(toggleCoin(['spring', 'eth'], 'spring')).toEqual(['eth']);
    expect(toggleCoin(['eth'], 'eth')).toEqual(['eth']);
  });

  it('"All" shows every available coin; again, the single coin from before', () => {
    expect(toggleAll(['eth'], ALL, 'eth')).toEqual(ALL);
    expect(toggleAll(ALL, ALL, 'eth')).toEqual(['eth']);
    // The coin from before is no longer available: the first one is.
    expect(toggleAll(['spring', 'summer'], ['spring', 'summer'], 'btc')).toEqual(['spring']);
  });
});

describe('several lines on one chart', () => {
  const BOX = { width: 100, height: 100, pad: 0 };

  it('one scale for all lines: the highest value of any line is at the top', () => {
    const { lines, minY, maxY } = scaleSeries(
      [
        [
          [0, 0],
          [10, 5],
        ],
        [
          [5, -10],
          [10, 20],
        ],
      ],
      BOX
    );
    expect([minY, maxY]).toEqual([-10, 20]);
    expect(lines[1][1]).toEqual([100, 0]); // (10, 20): right edge, top
    expect(lines[0][0][0]).toBe(0);
    expect(lines[0][0][1]).toBeCloseTo(66.667, 3); // (0, 0): two thirds down
    expect(lines[1][0][0]).toBe(50); // aligned by x: the second line starts halfway
  });

  it('no line across a gap: the path starts a new piece after it', () => {
    const points = [
      [0, 1],
      [1, 1],
      [5, 1],
      [6, 1],
    ];
    const breaks = gapsIn(points, 2);
    expect([...breaks]).toEqual([2]);
    expect(linePath(points, breaks)).toBe('M0.0 1.0 L1.0 1.0 M5.0 1.0 L6.0 1.0');
  });
});
