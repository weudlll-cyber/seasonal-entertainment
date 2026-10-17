// ============================================================
// File:        schema.js
// Path:        server/src/info/schema.js
// Project:     Seasonal Entertainment
// Description: Info pages: slug (address), title, Markdown body, draft/published status, the
//              order on the Info index, and who changed it last.
// ============================================================

export const INFO_SCHEMA = `
CREATE TABLE IF NOT EXISTS info_pages (
  id              INTEGER PRIMARY KEY,
  slug            TEXT    NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  body            TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  position        INTEGER NOT NULL DEFAULT 0,
  updated_by_name TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;
