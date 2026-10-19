// ============================================================
// File:        store.js
// Path:        server/src/settings/store.js
// Project:     Seasonal Entertainment
// Description: Reads and writes site settings (definitions.js): a stored value, or the
//              default when none is stored. Areas with a setting that is not a number (the
//              embedding sites, embed/origins.js) read the stored text themselves.
// ============================================================

import { SETTINGS } from './definitions.js';

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? Number(row.value) : SETTINGS[key].default;
}

// The stored text of a setting, or null when none is stored.
export function getTextSetting(db, key) {
  return db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key)?.value ?? null;
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
