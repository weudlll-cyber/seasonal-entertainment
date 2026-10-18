// ============================================================
// File:        schema.js
// Path:        server/src/settings/schema.js
// Project:     Seasonal Entertainment
// Description: Site settings admins change without code changes (settings/definitions.js
//              lists every key with its default and limits). Only changed values are stored.
// ============================================================

export const SETTINGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
