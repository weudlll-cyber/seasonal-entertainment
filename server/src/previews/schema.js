// ============================================================
// File:        schema.js
// Path:        server/src/previews/schema.js
// Project:     Seasonal Entertainment
// Description: Link previews, one row per URL: when it was fetched (the 24-hour cache), whether
//              a preview came out of it, the plain-text title / description / site name and the
//              preview image stored in the media folder. Messages point at a row (chat/schema.js).
// ============================================================

export const PREVIEW_SCHEMA = `
CREATE TABLE IF NOT EXISTS link_previews (
  id           INTEGER PRIMARY KEY,
  url          TEXT    NOT NULL UNIQUE,
  fetched_at   TEXT    NOT NULL,
  ok           INTEGER NOT NULL CHECK (ok IN (0, 1)),
  title        TEXT,
  description  TEXT,
  site_name    TEXT,
  image_file   TEXT,
  image_width  INTEGER,
  image_height INTEGER
);
`;
