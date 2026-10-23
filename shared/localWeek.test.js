// ============================================================
// File:        localWeek.test.js
// Path:        shared/localWeek.test.js
// Project:     Seasonal Entertainment
// Description: Guards the viewer's local week and times: weeks start on the local Monday, the
//              week of Europe's daylight-saving change (25 October 2026) is 169 hours long, and
//              one UTC instant shows the right local time and zone on either side of the change
//              and in a zone behind UTC; the site's date format, with a time and by the day only.
// ============================================================

import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDay, formatLocal, startOfWeek } from './localWeek.js';

const BERLIN = 'Europe/Berlin';
const at = (iso) => Date.parse(iso);

describe('startOfWeek', () => {
  it('is local Monday 00:00 (Berlin summer time = 22:00 UTC on Sunday)', () => {
    expect(new Date(startOfWeek(at('2026-10-21T12:00Z'), BERLIN)).toISOString()).toBe(
      '2026-10-18T22:00:00.000Z'
    );
  });

  it('the week of the daylight-saving change is 169 hours long', () => {
    const start = startOfWeek(at('2026-10-21T12:00Z'), BERLIN);
    const next = startOfWeek(at('2026-10-21T12:00Z'), BERLIN, 1);
    expect(new Date(next).toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect((next - start) / 3_600_000).toBe(169);
  });

  it('works for zones behind UTC: Monday 01:00 UTC still belongs to the previous week in New York', () => {
    const week = startOfWeek(at('2026-10-19T01:00Z'), 'America/New_York');
    expect(new Date(week).toISOString()).toBe('2026-10-12T04:00:00.000Z');
  });
});

describe('local labels across the DST boundary', () => {
  it('18:00 UTC on a Monday is 20:00 CEST before the change and 19:00 CET after it', () => {
    expect(formatLocal(at('2026-10-19T18:00Z'), BERLIN)).toEqual({ time: '20:00', zone: 'CEST' });
    expect(formatLocal(at('2026-10-26T18:00Z'), BERLIN)).toEqual({ time: '19:00', zone: 'CET' });
  });

  it('a late Sunday UTC is Monday in Berlin, and Sunday evening in New York', () => {
    expect(formatDay(at('2026-10-25T23:30Z'), BERLIN)).toBe('Monday 26 October');
    expect(formatDay(at('2026-10-19T01:00Z'), 'America/New_York')).toBe('Sunday 18 October');
  });
});

describe("formatDateTime: the site's one date format", () => {
  const NOW = Date.parse('2026-10-21T12:00:00Z');
  it('weekday, day, month, 24-hour time and zone, the zone kept with its time', () => {
    expect(formatDateTime('2026-10-22T18:30:00Z', 'Europe/Berlin', NOW)).toBe(
      `Thursday 22 October, 20:30${String.fromCharCode(0xa0)}CEST`
    );
  });

  it('adds the year only when it is not the current one in that zone', () => {
    expect(formatDateTime('2027-01-04T09:00:00Z', 'UTC', NOW)).toMatch(/^Monday 4 January 2027, /);
    expect(formatDateTime('2025-12-31T23:30:00Z', 'Europe/Berlin', NOW)).toMatch(
      /^Thursday 1 January, 00:30/
    );
  });
});

describe('formatDate: the same date by the day only', () => {
  it('has no time, and the year only outside the current one', () => {
    const NOW = Date.parse('2026-10-23T12:00:00Z');
    expect(formatDate('2026-12-05T10:30:47Z', 'Europe/Vienna', NOW)).toBe('Saturday 5 December');
    expect(formatDate('2027-03-06T10:00:00Z', 'Europe/Vienna', NOW)).toBe('Saturday 6 March 2027');
    // The day where the viewer is: late on the 5th in UTC is the 6th in Tokyo.
    expect(formatDate('2026-12-05T20:00:00Z', 'Asia/Tokyo', NOW)).toBe('Sunday 6 December');
  });
});
