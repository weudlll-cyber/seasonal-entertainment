// ============================================================
// File:        schema.js
// Path:        server/src/directFiles/schema.js
// Project:     Seasonal Entertainment
// Description: Files in direct messages (docs/CHAT.md, "Files in direct messages", decided
//              2026-10-22). direct_files: one encrypted file as the sender's browser uploaded it
//              (ciphertext only, under a generated name in the media folder's direct/, never
//              public), between its uploader and the partner; pending until a message takes it
//              (message_id), then it lives as long as that message. direct_report_files: a
//              file a reporter chose to share with a report, decrypted in their browser
//              (direct-reports/), for moderators only, deleted with the report's copies.
// ============================================================

export const DIRECT_FILES_SCHEMA = `
CREATE TABLE IF NOT EXISTS direct_files (
  id          INTEGER PRIMARY KEY,
  uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id  INTEGER UNIQUE REFERENCES direct_messages(id) ON DELETE SET NULL,
  attached_at TEXT,
  file        TEXT    NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS direct_files_by_uploader ON direct_files (uploader_id, created_at);
CREATE TABLE IF NOT EXISTS direct_report_files (
  id         INTEGER PRIMARY KEY,
  report_id  INTEGER NOT NULL REFERENCES direct_reports(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  file       TEXT    NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT    NOT NULL,
  UNIQUE (report_id, message_id)
);
`;
