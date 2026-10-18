// ============================================================
// File:        schema.js
// Path:        server/src/events/schema.js
// Project:     Seasonal Entertainment
// Description: Recurring community events. A rule ("weekly" or "monthly_first" = the first
//              <weekday> of each month), an ISO weekday (1 = Monday ... 7 = Sunday) and a start
//              time in UTC; the site shows each viewer their own local time.
// ============================================================

export const EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY,
  title            TEXT    NOT NULL,
  description      TEXT    NOT NULL DEFAULT '',
  rule             TEXT    NOT NULL CHECK (rule IN ('weekly', 'monthly_first')),
  weekday          INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  time_utc         TEXT    NOT NULL,
  duration_minutes INTEGER,
  channel          TEXT    NOT NULL DEFAULT '',
  link             TEXT    NOT NULL DEFAULT '',
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
`;
