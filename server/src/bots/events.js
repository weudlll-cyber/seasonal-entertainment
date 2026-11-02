// ============================================================
// File:        events.js
// Path:        server/src/bots/events.js
// Project:     Seasonal Entertainment
// Description: The event bot's occurrences in a time window (docs/BOTS.md), as the bot itself
//              shows them (stannouncebot parsing/query_service.py): active events only, the
//              latest override per occurrence (highest id) replacing start, location and status
//              where it sets them. The bot keeps one occurrence per announcement channel
//              (Telegram, Discord, ...); the site lists an event at one start once: the copies
//              are grouped by event and effective start (groupCopies). Which platforms announce
//              it is the bot's business and never leaves the server (decided 2026-11-02): only
//              the places show, each once. The site
//              computes no recurrences of its own. Bot text stays text; a location URL is
//              passed on only if it is http(s); the image URL (http(s) only) stays on the
//              server, which fetches the image itself (images.js).
// ============================================================

const EFFECTIVE = `
  SELECT o.id, o.event_id AS eventId, e.name, e.description, e.category,
    e.image_url AS imageUrl,
    COALESCE(ov.new_start_ts_utc, o.start_ts_utc) AS start,
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
function parseBotTime(text) {
  if (typeof text !== 'string') return NaN;
  return Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}Z`);
}

// Only a web address becomes a link on the site.
function webUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// The places of some copies: each location (label and link) once, in copy order.
function placesOf(copies) {
  const places = [];
  for (const c of copies) {
    const place = { locationLabel: c.locationLabel ?? '', locationUrl: webUrl(c.locationUrl) };
    const same = (p) =>
      p.locationLabel === place.locationLabel && p.locationUrl === place.locationUrl;
    if (!places.some(same)) places.push(place);
  }
  return places;
}

// One entry per event and start from its copies (rows of one event at one instant, id order).
// Canceled only if every copy is; otherwise the status and the places of the copies that are
// not, so a channel dropped in the bot no longer shows. The id is the lowest copy's and ids
// holds every copy's, canceled ones included: a call linked to any copy (also before the
// grouping, docs/CALLS.md) still finds its entry.
function groupCopies(copies) {
  const [first] = copies;
  const running = copies.filter((c) => c.status !== 'canceled');
  const shown = running.length ? running : copies;
  return {
    id: first.id,
    ids: copies.map((c) => c.id),
    name: first.name,
    description: first.description ?? '',
    category: first.category ?? '',
    start: first.start,
    places: placesOf(shown),
    // A running date counts as scheduled while any copy still is (one channel may be done).
    status: running.some((c) => c.status === 'scheduled') ? 'scheduled' : shown[0].status,
    imageUrl: webUrl(first.imageUrl), // for the server only (routes.js)
  };
}

// Occurrences starting in [from, to) (milliseconds), one per event and start: the dates are
// matched loosely in SQL (a day either side, whatever the stored format), the exact instants
// here.
export function botOccurrences(db, from, to) {
  const groups = new Map();
  for (const row of db.prepare(EFFECTIVE).all(day(from - DAY_MS), day(to + DAY_MS))) {
    const start = parseBotTime(row.start);
    if (!(start >= from && start < to)) continue;
    const key = `${row.eventId}@${start}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...row, start });
  }
  // Sorted by instant: the SQL orders by the stored text, whose formats may differ.
  return [...groups.values()].map(groupCopies).sort((a, b) => a.start - b.start || a.id - b.id);
}
