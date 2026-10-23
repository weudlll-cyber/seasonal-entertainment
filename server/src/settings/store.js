// ============================================================
// File:        store.js
// Path:        server/src/settings/store.js
// Project:     Seasonal Entertainment
// Description: Reads and writes site settings (definitions.js): a stored value, or the
//              default when none is stored, turned into its kind's value (types.js). Values
//              are kept in memory per database and dropped on every write, so a change takes
//              effect at the next use without a restart. Areas with a setting that is not
//              defined here (the embedding sites, embed/origins.js; the recap's last week)
//              read and write the stored text themselves.
// ============================================================

import { GROUPS, SETTINGS } from './definitions.js';
import { TYPES } from './types.js';

const cache = new WeakMap(); // db -> Map(key -> value)

export function getSetting(db, key) {
  let values = cache.get(db);
  if (!values) cache.set(db, (values = new Map()));
  if (!values.has(key)) {
    const definition = SETTINGS[key];
    const text = getTextSetting(db, key);
    values.set(key, text === null ? definition.default : TYPES[definition.type].parse(text));
  }
  return values.get(key);
}

// The stored text of a setting, or null when none is stored.
export function getTextSetting(db, key) {
  return db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key)?.value ?? null;
}

// null when value fits the setting, else the message for the admin page.
export function checkSetting(key, value) {
  const definition = SETTINGS[key];
  return TYPES[definition.type].check(definition, value, definition.choices);
}

// Every setting with its definition and current value, in the admin page's group order.
export function listSettings(db) {
  return Object.entries(SETTINGS)
    .map(([key, definition]) => ({ key, ...definition, value: getSetting(db, key) }))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
  cache.get(db)?.delete(key);
}
