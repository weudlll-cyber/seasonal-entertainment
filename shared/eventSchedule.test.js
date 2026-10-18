// ============================================================
// File:        eventSchedule.test.js
// Path:        shared/eventSchedule.test.js
// Project:     Seasonal Entertainment
// Description: Guards the event schedule: UTC rules shown in the viewer's zone, including
//              the daylight-saving change in Europe (25 October 2026), weeks that start on the
//              local Monday, events that fall on another local day, and the first-weekday rule.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  formatLocal,
  occurrencesInWeek,
  startOfWeek,
  upcomingOccurrences,
} from './eventSchedule.js';

const BERLIN = 'Europe/Berlin';
const at = (iso) => Date.parse(iso);
const monday18 = { id: 1, rule: 'weekly', weekday: 1, timeUtc: '18:00' };

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
});

describe('UTC to local time across the DST boundary', () => {
  it('Monday 18:00 UTC is 20:00 CEST before the change and 19:00 CET after it', () => {
    const before = occurrencesInWeek(
      [monday18],
      startOfWeek(at('2026-10-21T12:00Z'), BERLIN),
      BERLIN
    );
    const after = occurrencesInWeek(
      [monday18],
      startOfWeek(at('2026-10-28T12:00Z'), BERLIN),
      BERLIN
    );
    expect(before.map((o) => new Date(o.start).toISOString())).toEqual([
      '2026-10-19T18:00:00.000Z',
    ]);
    expect(formatLocal(before[0].start, BERLIN)).toEqual({ time: '20:00', zone: 'CEST' });
    expect(formatLocal(after[0].start, BERLIN)).toEqual({ time: '19:00', zone: 'CET' });
  });

  it('an event late on Sunday UTC belongs to the next local week when it is Monday there', () => {
    const late = { id: 2, rule: 'weekly', weekday: 7, timeUtc: '23:30' };
    const week = startOfWeek(at('2026-10-21T12:00Z'), BERLIN);
    // Sunday 25 Oct 23:30 UTC = Monday 26 Oct 00:30 CET: not in the week of 19 October...
    expect(occurrencesInWeek([late], week, BERLIN)).toEqual([
      { event: late, start: at('2026-10-18T23:30Z') },
    ]);
    // ...but in the next one.
    const next = occurrencesInWeek([late], startOfWeek(week, BERLIN, 1), BERLIN);
    expect(next.map((o) => new Date(o.start).toISOString())).toEqual(['2026-10-25T23:30:00.000Z']);
  });

  it('the extra hour of the DST week counts: Sunday 22:30 UTC is still Sunday in Berlin', () => {
    const lateSunday = { id: 5, rule: 'weekly', weekday: 7, timeUtc: '22:30' };
    // 25 Oct 22:30 UTC = 23:30 CET Sunday: inside the week, which ends 169 h after its start.
    const week = startOfWeek(at('2026-10-21T12:00Z'), BERLIN);
    expect(
      occurrencesInWeek([lateSunday], week, BERLIN).map((o) => new Date(o.start).toISOString())
    ).toEqual(['2026-10-18T22:30:00.000Z', '2026-10-25T22:30:00.000Z']);
  });

  it('works for zones behind UTC: Monday 01:00 UTC is Sunday evening in New York', () => {
    const early = { id: 3, rule: 'weekly', weekday: 1, timeUtc: '01:00' };
    const zone = 'America/New_York';
    const week = startOfWeek(at('2026-10-21T12:00Z'), zone);
    const [first] = occurrencesInWeek([early], week, zone);
    expect(formatLocal(first.start, zone)).toEqual({ time: '21:00', zone: 'GMT-4' });
  });
});

describe('first <weekday> of the month', () => {
  const guess = { id: 4, rule: 'monthly_first', weekday: 4, timeUtc: '19:00' };
  const inWeekOf = (iso) =>
    occurrencesInWeek([guess], startOfWeek(at(iso), 'UTC'), 'UTC').map((o) =>
      new Date(o.start).toISOString()
    );

  it('happens on the first Thursday only', () => {
    expect(inWeekOf('2026-10-01T12:00Z')).toEqual(['2026-10-01T19:00:00.000Z']);
    expect(inWeekOf('2026-10-08T12:00Z')).toEqual([]);
    expect(inWeekOf('2026-10-29T12:00Z')).toEqual([]);
    expect(inWeekOf('2026-11-05T12:00Z')).toEqual(['2026-11-05T19:00:00.000Z']);
  });
});

describe('upcomingOccurrences', () => {
  const ev = (id, weekday, timeUtc, rule = 'weekly') => ({ id, weekday, timeUtc, rule, title: id });
  // Wednesday 2026-10-14, 12:00 UTC.
  const wednesdayNoon = Date.UTC(2026, 9, 14, 12, 0);

  it('the next ones from now, across the week boundary, in time order', () => {
    const events = [ev('monday', 1, '20:00'), ev('thursday', 4, '18:00'), ev('wed', 3, '11:00')];
    const next = upcomingOccurrences(events, wednesdayNoon, 'UTC', 2);
    expect(next.map((o) => [o.event.id, new Date(o.start).toISOString()])).toEqual([
      ['thursday', '2026-10-15T18:00:00.000Z'],
      ['monday', '2026-10-19T20:00:00.000Z'],
    ]);
  });

  it('reaches a first-of-the-month event weeks ahead; nothing when there are no events', () => {
    const next = upcomingOccurrences(
      [ev('first-thu', 4, '20:00', 'monthly_first')],
      wednesdayNoon,
      'UTC',
      1
    );
    expect(new Date(next[0].start).toISOString()).toBe('2026-11-05T20:00:00.000Z');
    expect(upcomingOccurrences([], wednesdayNoon, 'UTC', 2)).toEqual([]);
  });
});
