// ============================================================
// File:        events.js
// Path:        server/src/bots/events.js
// Project:     Seasonal Entertainment
// Description: The event bot's occurrences in a time window (docs/BOTS.md), as the bot itself
//              shows them (stannouncebot parsing/query_service.py): active events only, the
//              latest override per occurrence (highest id) replacing start, platform, location
//              and status where it sets them. The site computes no recurrences of its own. Bot
//              text stays text; a location URL is passed on only if it is http(s); the image
//              URL is never passed on (the site loads no outside images).
// ============================================================

const EFFECTIVE = `
  SELECT o.id, e.name, e.description, e.category,
    COALESCE(ov.new_start_ts_utc, o.start_ts_utc) AS start,
    COALESCE(ov.new_platform, o.platform) AS platform,
    COALESCE(ov.new_location_url, o.location_url) AS locationUrl,
    COALESCE(ov.new_location_label, o.location_label) AS locationLabel,
    COALESCE(ov.new_status, o.status) AS status
  FROM occurrences o
  JOIN events e ON e.id = o.event_id
  LEFT JOIN occurrence_overrides ov ON ov.id = (
    SELECT MAX(inner_ov.id) FROM occurrence_overrides inner_ov WHERE inner_ov.occurrence_id = o.id
  )
  WHERE e.active = 1
    AND substr(COALESCE(ov.new_start_ts_utc, o.start_ts_utc), 1, 10) BETWEEN ? AND ?
  ORDER BY start, o.id`;

const DAY_MS = 24 * 60 * 60_000;
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// The bot writes ISO-8601 UTC, with "Z" or "+00:00"; a time without an offset counts as UTC.
export function parseBotTime(text) {
  if (typeof text !== 'string') return NaN;
  return Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}Z`);
}

// Only a web address becomes a link on the site.
export function webUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// Occurrences starting in [from, to) (milliseconds): the dates are matched loosely in SQL (a
// day either side, whatever the stored format), the exact instants here.
export function botOccurrences(db, from, to) {
  return db
    .prepare(EFFECTIVE)
    .all(day(from - DAY_MS), day(to + DAY_MS))
    .map((row) => ({ ...row, start: parseBotTime(row.start) }))
    .filter((row) => row.start >= from && row.start < to)
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      category: row.category ?? '',
      start: row.start,
      platform: row.platform ?? '',
      locationLabel: row.locationLabel ?? '',
      locationUrl: webUrl(row.locationUrl),
      status: row.status,
    }));
}
