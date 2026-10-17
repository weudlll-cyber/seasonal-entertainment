// ============================================================
// File:        schema.js
// Path:        server/src/chat/schema.js
// Project:     Seasonal Entertainment
// Description: Chat tables: rooms (who may read/write; guests write only where guest_writable
//              is set), messages (author is an account or a guest; hidden by moderators),
//              reports, sanctions (mute with an end, ban without) and guest names (unique while
//              held; released by the retention job). A message is text, or a sticker / GIF
//              from the media library (media/schema.js), optionally with a link preview
//              (previews/schema.js); a report counts until a moderator marks it reviewed.
//              Members' favourite rooms and favourite members (gone with the account).
//              migrateChat() brings older databases up.
// ============================================================

import { addMissingColumns } from '../db/addColumns.js';

export const CHAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_rooms (
  id           INTEGER PRIMARY KEY,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  read_access  TEXT    NOT NULL CHECK (read_access IN ('everyone', 'members', 'organisers')),
  write_access TEXT    NOT NULL CHECK (write_access IN ('everyone', 'members', 'organisers')),
  guest_writable INTEGER NOT NULL DEFAULT 0 CHECK (guest_writable IN (0, 1)),
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
  kind           TEXT    NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'sticker', 'gif')),
  body           TEXT    NOT NULL,
  media_item_id  INTEGER REFERENCES media_items(id) ON DELETE SET NULL,
  preview_id     INTEGER REFERENCES link_previews(id) ON DELETE SET NULL,
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
  reviewed_at TEXT,
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
CREATE TABLE IF NOT EXISTS chat_favourite_rooms (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id    INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, room_id)
);
CREATE TABLE IF NOT EXISTS chat_favourite_users (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favourite_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL,
  PRIMARY KEY (user_id, favourite_id),
  CHECK (user_id <> favourite_id)
);
`;

// Columns added after a table was first created; CREATE IF NOT EXISTS skips them.
const ADDED_COLUMNS = [
  [
    'chat_rooms',
    'guest_writable',
    'INTEGER NOT NULL DEFAULT 0 CHECK (guest_writable IN (0, 1))',
    // Rooms everyone could write in until then (General) stay guest-writable.
    `UPDATE chat_rooms SET guest_writable = 1
     WHERE read_access = 'everyone' AND write_access = 'everyone'`,
  ],
  [
    'chat_messages',
    'kind',
    "TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'sticker', 'gif'))",
  ],
  ['chat_messages', 'media_item_id', 'INTEGER REFERENCES media_items(id) ON DELETE SET NULL'],
  ['chat_messages', 'preview_id', 'INTEGER REFERENCES link_previews(id) ON DELETE SET NULL'],
  ['chat_reports', 'reviewed_at', 'TEXT'],
];

export const migrateChat = (db) => addMissingColumns(db, ADDED_COLUMNS);
