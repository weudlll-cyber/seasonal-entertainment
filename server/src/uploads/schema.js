// ============================================================
// File:        schema.js
// Path:        server/src/uploads/schema.js
// Project:     Seasonal Entertainment
// Description: Files members upload to the chat (images and PDFs). A row is "pending" until a
//              message takes it (message_id), then lives as long as that message. A removed
//              file (moderation) keeps its row without files, for the "file removed" note.
// ============================================================

export const UPLOAD_SCHEMA = `
CREATE TABLE IF NOT EXISTS chat_uploads (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message_id  INTEGER UNIQUE REFERENCES chat_messages(id) ON DELETE SET NULL,
  attached_at TEXT,
  kind        TEXT    NOT NULL CHECK (kind IN ('image', 'pdf')),
  name        TEXT    NOT NULL,
  mime        TEXT    NOT NULL,
  bytes       INTEGER NOT NULL,
  file        TEXT,
  thumb_file  TEXT,
  width       INTEGER,
  height      INTEGER,
  created_at  TEXT    NOT NULL,
  removed_at  TEXT,
  removed_by  TEXT
);
CREATE INDEX IF NOT EXISTS chat_uploads_by_user ON chat_uploads (user_id, created_at);
`;
