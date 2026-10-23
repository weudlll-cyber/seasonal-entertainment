// ============================================================
// File:        store.js
// Path:        server/src/settings/store.js
// Project:     Seasonal Entertainment
// Description: Reads and writes site settings (definitions.js): a stored value, or the
//              default when none is stored, turned into its kind's value (types.js). Values
//              are kept in memory per database and dropped on every write, so a change takes
//              effect at the next use without a restart. A default taken from the config
//              (an env value today) needs bindSettingsConfig() once, at app start. The settings
//              marked public go to every visitor with the session (publicSettings). Areas with
//              a setting that is not
//              defined here (the embedding sites, embed/origins.js; the recap's last week)
//              read and write the stored text themselves.
// ============================================================

import { GROUPS, SETTINGS } from './definitions.js';
import { TYPES } from './types.js';

const cache = new WeakMap(); // db -> Map(key -> value)
const configs = new WeakMap(); // db -> config, for defaults taken from it

export function bindSettingsConfig(db, config) {
  configs.set(db, config);
}

// A definition's default: a value, or a function of the config (the env value is the default).
function defaultOf(db, definition) {
  if (typeof definition.default !== 'function') return definition.default;
  const config = configs.get(db);
  if (!config) throw new Error('[settings] bindSettingsConfig(db, config) must run first');
  return definition.default(config);
}

export function getSetting(db, key) {
  let values = cache.get(db);
  if (!values) cache.set(db, (values = new Map()));
  if (!values.has(key)) {
    const definition = SETTINGS[key];
    const text = getTextSetting(db, key);
    values.set(key, text === null ? defaultOf(db, definition) : TYPES[definition.type].parse(text));
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
    .map(([key, definition]) => ({
      key,
      ...definition,
      default: defaultOf(db, definition),
      value: getSetting(db, key),
    }))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
}

// { key: value } of the settings every visitor's browser needs (shared/siteSettings.js).
export function publicSettings(db) {
  return Object.fromEntries(
    Object.keys(SETTINGS)
      .filter((key) => SETTINGS[key].public)
      .map((key) => [key, getSetting(db, key)])
  );
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO site_settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
  cache.get(db)?.delete(key);
}
