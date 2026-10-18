// ============================================================
// File:        schema.js
// Path:        server/src/calls/schema.js
// Project:     Seasonal Entertainment
// Description: Community calls (docs/CALLS.md): title, optional description and planned time,
//              status (scheduled, live, ended), who created it, when it started and ended, its
//              chat room (an unlisted chat room, read-only once the call ends) and the name of
//              its room on the call service.
// ============================================================

export const CALLS_SCHEMA = `
CREATE TABLE IF NOT EXISTS calls (
  id            INTEGER PRIMARY KEY,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_for TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL,
  started_at    TEXT,
  ended_at      TEXT,
  chat_room_id  INTEGER REFERENCES chat_rooms(id) ON DELETE SET NULL,
  room_name     TEXT    NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS calls_by_status ON calls (status);
`;
