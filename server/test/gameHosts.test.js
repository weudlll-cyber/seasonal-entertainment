// ============================================================
// File:        gameHosts.test.js
// Path:        server/test/gameHosts.test.js
// Project:     Seasonal Entertainment
// Description: Hosting per embedded game (accounts/gameHosts.js; docs/AUTH.md, "Embedded games";
//              decided 2026-11-09): the one-time move from the old flag users.can_start_games
//              gives every flagged account every game of the allowlist and nobody else
//              anything, then drops the flag; a grant goes with its account; an admin's change
//              of one game is noted as "rights" only when it really changes something.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { setGameHost } from '../src/accounts/gameHosts.js';
import { openDatabase } from '../src/db/database.js';
import { EMBEDDED_GAMES } from '../src/games/embedded.js';

let dir;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const user = (db, name) =>
  Number(
    db
      .prepare("INSERT INTO users (username, email, role) VALUES (?, ?, 'member')")
      .run(name, `${name}@example.org`).lastInsertRowid
  );
const grants = (db) =>
  db.prepare('SELECT user_id AS id, game FROM user_game_hosts ORDER BY user_id, game').all();

it('the old flag becomes a grant for every game of the allowlist, then goes', () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-hosts-'));
  const file = path.join(dir, 'old.db');
  // A database from before 2026-11-09: the flag on the users table.
  let db = openDatabase(file);
  db.exec(
    'ALTER TABLE users ADD COLUMN can_start_games INTEGER NOT NULL DEFAULT 0 CHECK (can_start_games IN (0, 1))'
  );
  const host = user(db, 'hosta');
  const plain = user(db, 'plain');
  db.prepare('UPDATE users SET can_start_games = 1 WHERE id = ?').run(host);
  db.close();

  db = openDatabase(file);
  expect(grants(db)).toEqual(Object.keys(EMBEDDED_GAMES).map((game) => ({ id: host, game })));
  expect(grants(db).some((g) => g.id === plain)).toBe(false);
  const columns = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((c) => c.name);
  expect(columns).not.toContain('can_start_games');
  // Opened again: nothing more happens.
  db.close();
  db = openDatabase(file);
  expect(grants(db)).toHaveLength(Object.keys(EMBEDDED_GAMES).length);
  db.close();
});

it('a change is noted as "rights" only when it changes; a grant goes with its account', () => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-hosts-'));
  const db = openDatabase(path.join(dir, 'new.db'));
  const id = user(db, 'mia');
  const changes = () => db.prepare('SELECT kind FROM account_changes WHERE user_id = ?').all(id);
  expect(setGameHost(db, { id }, 'bingo', true)).toBe(true);
  expect(setGameHost(db, { id }, 'bingo', true)).toBe(false);
  expect(changes()).toEqual([{ kind: 'rights' }]);
  expect(setGameHost(db, { id }, 'bingo', false)).toBe(true);
  expect(setGameHost(db, { id }, 'bingo', false)).toBe(false);
  expect(changes()).toHaveLength(2);
  setGameHost(db, { id }, 'mini-games', true);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  expect(grants(db)).toEqual([]);
  db.close();
});
