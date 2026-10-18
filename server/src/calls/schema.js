// ============================================================
// File:        schema.js
// Path:        server/src/calls/schema.js
// Project:     Seasonal Entertainment
// Description: Community calls (docs/CALLS.md): title, optional description and planned time,
//              status (scheduled, live, ended), who created it, when it started and ended, its
//              chat room (an unlisted chat room, read-only once the call ends), the name of
//              its room on the call service, who is in the spotlight (spotlight.js) and since
//              when a live call's room has been missing on the call service (staleCalls.js).
//              Participants: one per call and person (participants.js). migrateCalls() brings
//              an older calls table up (columns that came later: the spotlight, SE-CALLS-2;
//              room_missing_since, SE-NIGHT-2).
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

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
  room_name     TEXT    NOT NULL UNIQUE,
  spotlight_identity TEXT,
  spotlight_by  TEXT CHECK (spotlight_by IN ('organiser', 'self', 'share')),
  room_missing_since TEXT
);
CREATE INDEX IF NOT EXISTS calls_by_status ON calls (status);
CREATE TABLE IF NOT EXISTS call_participants (
  call_id        INTEGER NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  identity       TEXT    NOT NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  guest_id       TEXT,
  hand_raised_at TEXT,
  on_stage       INTEGER NOT NULL DEFAULT 0 CHECK (on_stage IN (0, 1)),
  PRIMARY KEY (call_id, identity),
  CHECK ((user_id IS NULL) != (guest_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS call_participants_user
  ON call_participants (call_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS call_participants_guest
  ON call_participants (call_id, guest_id) WHERE guest_id IS NOT NULL;
`;

// CREATE TABLE IF NOT EXISTS skips a table that exists already: a calls table made before the
// spotlight existed (a development database, 2026-10-18) gets its later columns here.
export function migrateCalls(db) {
  addMissingColumns(db, [
    ['calls', 'spotlight_identity', 'TEXT'],
    ['calls', 'spotlight_by', "TEXT CHECK (spotlight_by IN ('organiser', 'self', 'share'))"],
    ['calls', 'room_missing_since', 'TEXT'],
  ]);
}
