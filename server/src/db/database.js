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
import { ACCOUNTS_SCHEMA, migrateAccounts } from '../accounts/schema.js';
import { AUDIT_SCHEMA } from '../audit/schema.js';
import { CHAT_SCHEMA, migrateChat } from '../chat/schema.js';
import { EVENTS_SCHEMA } from '../events/schema.js';
import { GAMES_SCHEMA } from '../games/schema.js';
import { INFO_SCHEMA } from '../info/schema.js';
import { KEYS_SCHEMA } from '../keys/schema.js';
import { MEDIA_SCHEMA } from '../media/schema.js';
import { PREVIEW_SCHEMA } from '../previews/schema.js';
import { UPLOAD_SCHEMA } from '../uploads/schema.js';
import { TWO_FACTOR_SCHEMA } from '../twofa/schema.js';

// Order matters only for foreign keys: an area's tables come after those it references.
const SCHEMAS = [
  ACCOUNTS_SCHEMA,
  TWO_FACTOR_SCHEMA,
  KEYS_SCHEMA,
  AUDIT_SCHEMA,
  INFO_SCHEMA,
  EVENTS_SCHEMA,
  GAMES_SCHEMA,
  MEDIA_SCHEMA,
  PREVIEW_SCHEMA,
  CHAT_SCHEMA,
  UPLOAD_SCHEMA,
];

export function openDatabase(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  // WAL lets readers continue while one request writes; foreign keys are off by default.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const schema of SCHEMAS) db.exec(schema);
  // Columns added after a table was first created (CREATE IF NOT EXISTS skips them).
  migrateAccounts(db);
  migrateChat(db);
  return db;
}
