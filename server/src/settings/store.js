// ============================================================
// File:        store.js
// Path:        server/src/settings/store.js
// Project:     Seasonal Entertainment
// Description: Reads and writes site settings (definitions.js): a stored value, or the
//              default when none is stored.
// ============================================================

import { SETTINGS } from './definitions.js';

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? Number(row.value) : SETTINGS[key].default;
}

// Every setting with its definition and current value, for the admin page.
export function listSettings(db) {
  return Object.entries(SETTINGS).map(([key, definition]) => ({
    key,
    ...definition,
    value: getSetting(db, key),
  }));
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}
