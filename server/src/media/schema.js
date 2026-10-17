// ============================================================
// File:        schema.js
// Path:        server/src/media/schema.js
// Project:     Seasonal Entertainment
// Description: The chat media library: packs (stickers or GIFs, in an order, active or not)
//              and their items (name, alt text, credit, the generated file name on disk, real
//              type, size). Chat messages refer to items by id (chat/schema.js).
// ============================================================

export const MEDIA_SCHEMA = `
CREATE TABLE IF NOT EXISTS media_packs (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL,
  kind     TEXT    NOT NULL CHECK (kind IN ('sticker', 'gif')),
  position INTEGER NOT NULL DEFAULT 0,
  active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS media_items (
  id         INTEGER PRIMARY KEY,
  pack_id    INTEGER NOT NULL REFERENCES media_packs(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  alt        TEXT    NOT NULL,
  credit     TEXT,
  file       TEXT    NOT NULL UNIQUE,
  mime       TEXT    NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  bytes      INTEGER NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS media_items_by_pack ON media_items (pack_id, position, id);
`;
