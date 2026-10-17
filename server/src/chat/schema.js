// ============================================================
// File:        schema.js
// Path:        server/src/chat/schema.js
// Project:     Seasonal Entertainment
// Description: Chat tables: rooms (who may read/write), messages (author is an account or a
//              guest; hidden by moderators), reports, sanctions (mute with an end, ban without)
//              and guest names (unique while held; released by the retention job).
// ============================================================

export const CHAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_rooms (
  id           INTEGER PRIMARY KEY,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  read_access  TEXT    NOT NULL CHECK (read_access IN ('everyone', 'members', 'organisers')),
  write_access TEXT    NOT NULL CHECK (write_access IN ('everyone', 'members', 'organisers')),
  position     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_guests (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id             INTEGER PRIMARY KEY,
  room_id        INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_guest   TEXT,
  author_name    TEXT    NOT NULL,
  body           TEXT    NOT NULL,
  created_at     TEXT    NOT NULL,
  hidden_at      TEXT,
  hidden_by      TEXT
);
CREATE INDEX IF NOT EXISTS chat_messages_by_room ON chat_messages (room_id, id);
CREATE INDEX IF NOT EXISTS chat_messages_by_age ON chat_messages (created_at);
CREATE TABLE IF NOT EXISTS chat_reports (
  id         INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reporter   TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  UNIQUE (message_id, reporter)
);
CREATE TABLE IF NOT EXISTS chat_sanctions (
  id         INTEGER PRIMARY KEY,
  kind       TEXT    NOT NULL CHECK (kind IN ('mute', 'ban')),
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  guest_id   TEXT,
  target     TEXT    NOT NULL,
  until      TEXT,
  created_by TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  lifted_at  TEXT
);
`;
