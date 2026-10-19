// ============================================================
// File:        botDb.js
// Path:        server/src/bots/botDb.js
// Project:     Seasonal Entertainment
// Description: Reading the owner's bot databases (docs/BOTS.md), strictly read-only: each
//              read opens the file with { readonly: true, fileMustExist: true } plus PRAGMA
//              query_only and closes it again, so the bot can replace or rewrite its file at
//              any time. Answers are kept in memory for a while (cachedRead), so the files are
//              opened at most once per period and key, whatever the traffic.
// ============================================================

import Database from 'better-sqlite3';

// Runs read(db) on the bot's file; the handle never outlives the call.
export function readBotDb(file, read) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    return read(db);
  } finally {
    db.close();
  }
}

// A small in-memory cache: get(key, load) returns the stored answer while it is younger than
// ttlMs, else load()'s. At most maxEntries keys (visitors pick the week they look at, so keys
// are not bounded otherwise); the oldest goes first. now is a parameter so tests move the clock.
export function cachedRead(ttlMs, { now = () => Date.now(), maxEntries = 200 } = {}) {
  const entries = new Map();
  return (key, load) => {
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = load();
    entries.delete(key); // re-inserted below, so the insertion order is the age order
    entries.set(key, { at: now(), value });
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return value;
  };
}
