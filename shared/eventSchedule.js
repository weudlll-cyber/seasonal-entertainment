// ============================================================
// File:        eventSchedule.js
// Path:        shared/eventSchedule.js
// Project:     Seasonal Entertainment
// Description: Turns event rules (weekly, or the first <weekday> of each month, at a UTC time)
//              into concrete start instants inside one week of a viewer's time zone, and
//              formats them for that zone. Pure functions; the time zone is a parameter so
//              tests can pin it (including daylight-saving changes).
// ============================================================

export const RULES = ['weekly', 'monthly_first'];
// ISO weekdays: 1 = Monday ... 7 = Sunday.
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Wall-clock parts of an instant in a time zone.
function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  }).formatToParts(new Date(instant));
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1,
  };
}

// The zone's offset from UTC at an instant, in milliseconds (e.g. +2 h in Berlin summer).
function offsetAt(instant, timeZone) {
  const p = zonedParts(instant, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(instant / 60_000) * 60_000;
}

// The instant of local midnight on a calendar date in the zone. Checked twice because the
// offset can differ between the guess and the result on a daylight-saving day.
function zonedMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

// Monday 00:00 (local) of the week containing `instant`, plus `weekOffset` weeks.
export function startOfWeek(instant, timeZone, weekOffset = 0) {
  const p = zonedParts(instant, timeZone);
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - (p.weekday - 1) + 7 * weekOffset));
  return zonedMidnight(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    timeZone
  );
}

// Does the rule produce an event on this UTC calendar date?
function occursOn(event, utcDate) {
  const weekday = ((utcDate.getUTCDay() + 6) % 7) + 1;
  if (weekday !== event.weekday) return false;
  return event.rule === 'weekly' || (event.rule === 'monthly_first' && utcDate.getUTCDate() <= 7);
}

// Every occurrence of the events in the local week starting at weekStart (from startOfWeek),
// sorted by time. The week ends at the next local Monday 00:00, which across a daylight-saving
// change is 167 or 169 hours later, not 168.
export function occurrencesInWeek(events, weekStart, timeZone) {
  const weekEnd = startOfWeek(weekStart, timeZone, 1);
  const found = [];
  // UTC days from one before to one after the local week cover every time-zone offset.
  for (let t = weekStart - DAY_MS; t < weekEnd + DAY_MS; t += DAY_MS) {
    const day = new Date(t);
    const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    for (const event of events) {
      if (!occursOn(event, new Date(midnight))) continue;
      const [hour, minute] = event.timeUtc.split(':').map(Number);
      const start = midnight + (hour * 60 + minute) * 60_000;
      if (start >= weekStart && start < weekEnd) found.push({ event, start });
    }
  }
  // The loop may visit one UTC day twice near the edges; keep each (event, start) once.
  const unique = new Map(found.map((o) => [`${o.event.id}@${o.start}`, o]));
  return [...unique.values()].sort((a, b) => a.start - b.start);
}

// The next `count` occurrences at or after `from` (e.g. "Up next" on the home page), sorted.
// Looks at most six local weeks ahead, which also reaches a first-of-the-month event.
export function upcomingOccurrences(events, from, timeZone, count) {
  const found = [];
  for (let week = 0; week < 6 && found.length < count; week++) {
    const weekStart = startOfWeek(from, timeZone, week);
    for (const occurrence of occurrencesInWeek(events, weekStart, timeZone)) {
      if (occurrence.start >= from) found.push(occurrence);
    }
  }
  return found.slice(0, count);
}

// "20:00" in the zone, plus the zone's short name ("CEST", "GMT+2", ...).
export function formatLocal(instant, timeZone) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
  const zone = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(instant))
    .find((p) => p.type === 'timeZoneName').value;
  return { time, zone };
}

// Local calendar label of an instant, e.g. "Monday 19 October".
export function formatDay(instant, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(instant));
}
