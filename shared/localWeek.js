// ============================================================
// File:        localWeek.js
// Path:        shared/localWeek.js
// Project:     Seasonal Entertainment
// Description: The viewer's local week and times: the local Monday 00:00 a week starts at
//              (daylight-saving weeks are 167 or 169 hours long) and the labels for a day and a
//              time in a time zone. Used for the event bot's occurrences (docs/BOTS.md). Pure
//              functions; the time zone is a parameter so tests can pin it.
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
