// ============================================================
// File:        droppedTables.test.js
// Path:        server/test/droppedTables.test.js
// Project:     Seasonal Entertainment
// Description: Guards the removal of the site's own events calendar (2026-10-20: events come
//              only from the event bot, docs/BOTS.md): a database that still has the old
//              `events` table loses it on the next start, and a fresh one never gets it.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';

let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const tables = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((t) => t.name);

it('drops the old events table on start; a fresh database never has one', () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-dropped-'));
  const file = path.join(dir, 'old.db');
  const old = new Database(file);
  old.exec(
    "CREATE TABLE events (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO events (title) VALUES ('x')"
  );
  old.close();

  const db = openDatabase(file);
  expect(tables(db)).not.toContain('events');
  db.close();

  const fresh = openDatabase(path.join(dir, 'fresh.db'));
  expect(tables(fresh)).not.toContain('events');
  expect(tables(fresh)).toContain('users'); // the rest of the schema is there
  fresh.close();
});
