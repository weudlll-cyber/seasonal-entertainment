// ============================================================
// File:        calendar.js
// Path:        server/src/calls/calendar.js
// Project:     Seasonal Entertainment
// Description: "Add to calendar" (docs/CALLS.md, "Calendar file"): one planned call as an
//              iCalendar file (RFC 5545) — a stable UID per call, DTSTAMP, start and end in UTC
//              (the call has no planned end: start + 60 minutes), the title, the description and
//              the call page's address, and one display alarm 15 minutes before. Only what the
//              Calls page shows anyway. Text is escaped and long lines folded as the RFC says.
// ============================================================

const DURATION_MS = 60 * 60_000;
const CRLF = '\r\n';

// 2026-10-21T19:30:00.000Z -> 20261021T193000Z
const utc = (date) =>
  new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

// RFC 5545 3.3.11: backslash, semicolon and comma escaped; line breaks as \n.
export const escapeText = (text) =>
  String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

// RFC 5545 3.1: lines longer than 75 octets continue on the next line after one space. Cut
// between characters, never inside one (UTF-8).
function fold(line) {
  const parts = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74; // a continuation starts with its space
    if (Buffer.byteLength(current + char) > limit) {
      parts.push(current);
      current = '';
    }
    current += char;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

// call: findCall's row with a planned start; origin: the site's address (selfOrigin);
// stamp: when the file is made (tests pin it).
export function callCalendar(call, origin, stamp = new Date()) {
  const start = Date.parse(call.scheduledFor);
  const page = `${origin}/calls/${call.id}`;
  const description = call.description ? `${call.description}\n\n${page}` : page;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Seasonal Entertainment//Calls//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // The same call always has the same UID: a second download updates, never duplicates.
    `UID:call-${call.id}@${new URL(origin).hostname}`,
    `DTSTAMP:${utc(stamp)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(start + DURATION_MS)}`,
    `SUMMARY:${escapeText(call.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${page}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15M',
    `DESCRIPTION:${escapeText(call.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}
