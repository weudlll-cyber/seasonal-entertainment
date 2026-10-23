// ============================================================
// File:        localWeek.js
// Path:        shared/localWeek.js
// Project:     Seasonal Entertainment
// Description: The viewer's local week and times: the local Monday 00:00 a week starts at
//              (daylight-saving weeks are 167 or 169 hours long) and the labels for a day and a
//              time in a time zone; formatDateTime is the one way the site writes a date and
//              time (docs/DESIGN.md, "Dates"), formatDate the same date where only the day is
//              meant. Used for the event bot's occurrences
//              (docs/BOTS.md), calls, prices and the admin lists. Pure functions; the time zone
//              (and "now", for the year) are parameters so tests can pin them.
// ============================================================

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

// A non-breaking space: the zone never ends up alone on the next line.
const NBSP = String.fromCharCode(0xa0);
const yearOf = (instant, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric' }).format(new Date(instant));

// Every date the site shows, as "Up next" does (decided 2026-10-21): "Thursday 22 October, 20:30
// CEST" in the zone, English, 24-hour; the year only when it is not the current one there
// ("Friday 31 December 2027, 23:00 CET").
export function formatDateTime(instant, timeZone, now = Date.now()) {
  const local = formatLocal(instant, timeZone);
  return `${formatDate(instant, timeZone, now)}, ${local.time}${NBSP}${local.zone}`;
}

// The same date without the time, where only the day is meant (the season clock's halvings):
// "Saturday 5 December", the year only when it is not the current one there.
export function formatDate(instant, timeZone, now = Date.now()) {
  const year = yearOf(instant, timeZone);
  return formatDay(instant, timeZone) + (year === yearOf(now, timeZone) ? '' : ` ${year}`);
}
