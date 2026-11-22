// ============================================================
// File:        seasonClock.test.js
// Path:        shared/seasonClock.test.js
// Project:     Seasonal Entertainment
// Description: Guards the season clock against the known past halvings (Spring June 2022,
//              Summer March 2023, Autumn December 2023, Winter September 2024, Spring June
//              2025, Summer March 2026), the contracts' era boundary to the second, the
//              rewards and the token in season, the next halving, and since when the token in
//              season leads (both sides of a halving that changed the leader).
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  DURATION_OF_ERA,
  SEASON_CONTRACTS,
  halvingsUntil,
  inSeasonSince,
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

describe('since when the token in season leads', () => {
  // Summer's halving of 2026-03-05 (70 -> 35) handed the lead to Autumn (60).
  const summer2026 = halvingsUntil(at('2026-04-01T00:00:00Z')).at(-1);

  it('is the halving that made it the leader, from that second on', () => {
    expect(summer2026.token).toBe('summer');
    expect(seasonClock(summer2026.at).inSeason).toBe('autumn');
    expect(inSeasonSince(summer2026.at)).toBe(summer2026.at);
    expect(inSeasonSince(at('2026-11-22T00:00:00Z'))).toBe(summer2026.at);
  });

  it("one second before, it is the earlier leader's halving", () => {
    expect(seasonClock(summer2026.at - 1).inSeason).toBe('summer');
    // Spring's halving of 2025-06-05 (84 -> 42) had made Summer (70) the leader.
    expect(month(inSeasonSince(summer2026.at - 1))).toBe('2025-06');
  });

  it("before any halving, Spring led from the contracts' creation", () => {
    const created = Math.max(...SEASON_CONTRACTS.map((c) => c.created));
    expect(inSeasonSince(at('2022-01-01T00:00:00Z'))).toBe(created);
  });
});
