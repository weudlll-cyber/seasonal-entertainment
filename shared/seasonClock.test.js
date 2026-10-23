// ============================================================
// File:        seasonClock.test.js
// Path:        shared/seasonClock.test.js
// Project:     Seasonal Entertainment
// Description: Guards the season clock against the known past halvings (Spring June 2022,
//              Summer March 2023, Autumn December 2023, Winter September 2024, Spring June
//              2025, Summer March 2026), the contracts' era boundary to the second, the
//              rewards and the token in season, and the next halving.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  DURATION_OF_ERA,
  SEASON_CONTRACTS,
  halvingsUntil,
  rewardAt,
  rewardEra,
  seasonClock,
} from './seasonClock.js';

const at = (iso) => Date.parse(iso) / 1000;
const month = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 7);
const contract = (token) => SEASON_CONTRACTS.find((c) => c.token === token);

describe('the halving schedule', () => {
  it('has the known past halvings, in order', () => {
    expect(halvingsUntil(at('2026-10-23T00:00:00Z')).map((h) => [h.token, month(h.at)])).toEqual([
      ['spring', '2022-06'],
      ['summer', '2023-03'],
      ['autumn', '2023-12'],
      ['winter', '2024-09'],
      ['spring', '2025-06'],
      ['summer', '2026-03'],
    ]);
  });

  it("changes era exactly where the contract's rewardEra does", () => {
    const spring = contract('spring');
    const boundary = spring.created + spring.firstEra;
    expect(rewardEra(spring, boundary - 1)).toBe(0);
    expect(rewardEra(spring, boundary)).toBe(1);
    expect(rewardEra(spring, boundary + DURATION_OF_ERA)).toBe(2);
    expect(rewardAt(spring, boundary)).toBe(84);
  });
});

describe('the clock', () => {
  it('is in the season with the highest reward', () => {
    // Before any halving Spring pays most (168); after its first halving (84) Summer (140).
    expect(seasonClock(at('2022-01-01T00:00:00Z')).inSeason).toBe('spring');
    expect(seasonClock(at('2022-07-01T00:00:00Z')).inSeason).toBe('summer');
    // 2026-10-23: Spring 42, Summer 35, Autumn 60, Winter 52.5.
    expect(seasonClock(at('2026-10-23T00:00:00Z')).inSeason).toBe('autumn');
  });

  it('names the next halving of any token', () => {
    const { next } = seasonClock(at('2026-10-23T00:00:00Z'));
    expect(next.token).toBe('autumn');
    expect(month(next.at)).toBe('2026-12');
  });
});
