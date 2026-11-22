// ============================================================
// File:        seasonFeed.test.js
// Path:        server/test/seasonFeed.test.js
// Project:     Seasonal Entertainment
// Description: Guards the public season feed GET /api/public/season (season/routes.js;
//              docs/GAME-INTEGRATION.md, "Season feed"): no login, cacheable for 60 seconds,
//              the shape the games read, the season on both sides of a halving, and the halving
//              days from 30 days ago to two years ahead, oldest first.
// ============================================================

import { halvingsUntil } from '@seasonal-entertainment/shared/seasonClock.js';
import { afterEach, describe, expect, it } from 'vitest';
import { seasonFeed } from '../src/season/routes.js';
import { makeTestApp } from './helpers/testApp.js';

const DAY = 24 * 60 * 60;
const at = (iso) => Date.parse(iso) / 1000;
// Summer's halving of 2026-03-05T22:32:17Z handed the lead to Autumn.
const summer2026 = halvingsUntil(at('2026-04-01T00:00:00Z')).at(-1).at;

let t;
afterEach(() => t?.close());

describe('GET /api/public/season', () => {
  it('answers a guest with the feed, cacheable for 60 seconds', async () => {
    t = makeTestApp();
    const res = await t.client().get('/api/public/season');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.body.v).toBe(1);
    expect(Object.keys(res.body.inSeason).sort()).toEqual(['season', 'since', 'token']);
    expect(res.body.inSeason.season).toMatch(/^(spring|summer|autumn|winter)$/);
    expect(res.body.inSeason.token).toBe(res.body.inSeason.season.toUpperCase());
    expect(res.body.inSeason.since).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    for (const h of res.body.halvingDays) {
      expect(h.day).toMatch(/^\d{4}-\d\d-\d\d$/);
      expect(h.token).toMatch(/^(SPRING|SUMMER|AUTUMN|WINTER)$/);
    }
  });
});

describe('the feed at a given moment', () => {
  it('on 2026-11-22: Autumn since Summer halved, the days ahead for two years', () => {
    expect(seasonFeed(at('2026-11-22T12:00:00Z'))).toEqual({
      v: 1,
      inSeason: { season: 'autumn', token: 'AUTUMN', since: '2026-03-05T22:32:17Z' },
      halvingDays: [
        { day: '2026-12-04', token: 'AUTUMN' },
        { day: '2027-09-04', token: 'WINTER' },
        { day: '2028-06-04', token: 'SPRING' },
      ],
    });
  });

  it('turns over at the halving, to the second', () => {
    expect(seasonFeed(summer2026 - 1).inSeason).toEqual({
      season: 'summer',
      token: 'SUMMER',
      since: '2025-06-05T04:27:54Z',
    });
    expect(seasonFeed(summer2026).inSeason).toEqual({
      season: 'autumn',
      token: 'AUTUMN',
      since: '2026-03-05T22:32:17Z',
    });
  });

  it('keeps a halving for 30 days, then drops it; takes one two years ahead', () => {
    const days = (time) => seasonFeed(time).halvingDays.map((h) => h.day);
    expect(days(summer2026 + 30 * DAY)[0]).toBe('2026-03-05');
    expect(days(summer2026 + 30 * DAY + 1)[0]).toBe('2026-12-04');
    // Summer's next halving, 2029-03-04, is exactly two years (730 days) after 2027-03-05.
    expect(days(summer2026 + 3 * 365 * DAY - 730 * DAY)).toContain('2029-03-04');
    expect(days(summer2026 + 3 * 365 * DAY - 730 * DAY - 1)).not.toContain('2029-03-04');
  });
});
