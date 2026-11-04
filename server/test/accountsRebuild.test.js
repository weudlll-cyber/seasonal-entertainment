// ============================================================
// File:        accountsRebuild.test.js
// Path:        server/test/accountsRebuild.test.js
// Project:     Seasonal Entertainment
// Description: The one-time rebuild of the users table (accounts/schema.js,
//              relaxEmailAndPassword): a database from before Discord logins (email and
//              password_hash NOT NULL) opens with both optional, every account kept with its id,
//              the other tables' references still working (a deletion still cascades), and a
//              second start leaves it alone; a stray row the database already had (an unrelated
//              broken reference) does not stop it.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';

let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// The users table as it was before 2026-11-02, and one table that references it.
const OLD = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', can_start_games INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0, session_epoch INTEGER NOT NULL DEFAULT 0, kdf_salt TEXT,
  legacy INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE user_keys (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL, created_at TEXT NOT NULL
);
INSERT INTO users (id, username, email, password_hash) VALUES (7, 'anna', 'a@x.test', 'h');
INSERT INTO user_keys (user_id, public_key, created_at) VALUES (7, 'pk', 'now');
`;

const notNull = (db, column) =>
  db
    .prepare('PRAGMA table_info(users)')
    .all()
    .find((c) => c.name === column).notnull;

it('makes email and password optional, keeping accounts and references', () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-rebuild-'));
  const file = path.join(dir, 'old.db');
  const old = new Database(file);
  old.exec(OLD);
  old.close();

  const db = openDatabase(file);
  expect(notNull(db, 'email')).toBe(0);
  expect(notNull(db, 'password_hash')).toBe(0);
  expect(db.prepare('SELECT id, username, email FROM users').all()).toEqual([
    { id: 7, username: 'anna', email: 'a@x.test' },
  ]);
  // An account without email or password now fits.
  db.prepare("INSERT INTO users (username) VALUES ('fromdiscord')").run();
  db.prepare("INSERT INTO users (username) VALUES ('another')").run();
  // The reference still cascades: the key goes with its account.
  db.prepare('DELETE FROM users WHERE id = 7').run();
  expect(db.prepare('SELECT COUNT(*) AS n FROM user_keys').get().n).toBe(0);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  db.close();

  // A second start finds nothing to do.
  const again = openDatabase(file);
  expect(again.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(2);
  again.close();
});

it('is not stopped by a broken reference the database already had', () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-rebuild-'));
  const file = path.join(dir, 'old.db');
  const old = new Database(file);
  old.exec(OLD);
  // An orphan from some earlier bug, in a table that has nothing to do with accounts.
  old.pragma('foreign_keys = OFF');
  old.exec(`
    CREATE TABLE shelves (id INTEGER PRIMARY KEY);
    CREATE TABLE books (id INTEGER PRIMARY KEY, shelf_id INTEGER REFERENCES shelves(id));
    INSERT INTO books (shelf_id) VALUES (99);
  `);
  old.close();

  const db = openDatabase(file);
  expect(notNull(db, 'email')).toBe(0);
  expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(1);
  expect(db.prepare('SELECT COUNT(*) AS n FROM user_keys').get().n).toBe(1);
  db.close();
});
