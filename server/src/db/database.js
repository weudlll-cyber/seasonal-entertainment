// ============================================================
// File:        database.js
// Path:        server/src/db/database.js
// Project:     Seasonal Entertainment
// Description: Opens the one SQLite database (path from configuration) and creates every
//              area's tables if they are missing. Each area owns one schema module that
//              exports its CREATE TABLE IF NOT EXISTS statements; they are listed here.
// ============================================================

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ACCOUNTS_SCHEMA } from '../accounts/schema.js';

// Order matters only for foreign keys: an area's tables come after those it references.
const SCHEMAS = [ACCOUNTS_SCHEMA];

export function openDatabase(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  // WAL lets readers continue while one request writes; foreign keys are off by default.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const schema of SCHEMAS) db.exec(schema);
  return db;
}
