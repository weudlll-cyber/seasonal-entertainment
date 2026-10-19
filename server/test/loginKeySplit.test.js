// ============================================================
// File:        loginKeySplit.test.js
// Path:        server/test/loginKeySplit.test.js
// Project:     Seasonal Entertainment
// Description: Guards the login key split (docs/AUTH.md): pre-login answers have the same shape
//              for known and unknown usernames (a stable fake salt for unknown ones); the server
//              stores bcrypt of the auth key and never accepts a password on any route; the
//              legacy login (removed in SE-NIGHT-2) is gone, so an account from before the key
//              split cannot log in with its password; older databases get the salt column.
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { keysFor, logIn } from './helpers/accountKeys.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const PASSWORD = 'correct-horse-1';
const prelogin = (username) => t.client().post('/api/auth/prelogin').send({ username });
const shape = (body) => ({
  keys: Object.keys(body).sort(),
  saltBytes: Buffer.from(body.salt, 'base64').length,
});

// An account as it was before the key split: bcrypt of the password itself, no salt.
async function preSplitAccount(username) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  t.db
    .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(username, `${username}@example.org`, hash);
}

describe('pre-login', () => {
  it('gives known and unknown usernames answers of identical shape', async () => {
    t = makeTestApp();
    await registerUser(t, 'anna', PASSWORD);
    const known = await prelogin('anna');
    const unknown = await prelogin('nobody');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(shape(unknown.body)).toEqual(shape(known.body));
    expect(shape(known.body)).toEqual({ keys: ['ok', 'salt'], saltBytes: 16 });
    // The real salt for the account; a stable, name-bound fake one for unknown names.
    expect(known.body.salt).toBe((await keysFor(PASSWORD)).salt);
    expect((await prelogin('NOBODY')).body.salt).toBe(unknown.body.salt);
    expect((await prelogin('somebody')).body.salt).not.toBe(unknown.body.salt);
  });

  it('is refused while the name is blocked from logging in', async () => {
    t = makeTestApp({ rateLimits: { loginAccount: { windowMs: 60_000, max: 2 } } });
    await registerUser(t, 'anna', PASSWORD);
    await logIn(t.client(), 'anna', 'wrong-password-1');
    await logIn(t.client(), 'anna', 'wrong-password-1');
    expect((await prelogin('anna')).status).toBe(429);
  });
});

describe('the server never takes the password', () => {
  it('stores bcrypt of the auth key, not of the password', async () => {
    t = makeTestApp();
    const { user } = await registerUser(t, 'anna', PASSWORD);
    const row = t.db
      .prepare('SELECT password_hash AS h, kdf_salt AS s FROM users WHERE id = ?')
      .get(user.id);
    const { salt, authKey } = await keysFor(PASSWORD);
    expect(row.s).toBe(salt);
    expect(await bcrypt.compare(authKey, row.h)).toBe(true);
    expect(await bcrypt.compare(PASSWORD, row.h)).toBe(false);
  });

  it('refuses a password where an auth key belongs', async () => {
    t = makeTestApp();
    await registerUser(t, 'anna', PASSWORD);
    const login = await t
      .client()
      .post('/api/auth/login')
      .send({ username: 'anna', password: PASSWORD });
    expect(login.status).toBe(400);
    const register = await t.client().post('/api/auth/register').send({
      username: 'ben',
      email: 'ben@example.org',
      password: PASSWORD,
      ageConfirmed: true,
    });
    expect(register.status).toBe(400);
  });
});

describe('the legacy login is gone', () => {
  it('has no route, and an account from before the key split opens with nothing', async () => {
    t = makeTestApp();
    await preSplitAccount('old');
    const route = await t
      .client()
      .post('/api/auth/legacy-login')
      .send({ username: 'old', password: PASSWORD });
    expect(route.status).toBe(404);
    // Its pre-login answer looks like any other (a fake salt), and nothing opens it.
    expect(shape((await prelogin('old')).body)).toEqual({ keys: ['ok', 'salt'], saltBytes: 16 });
    expect((await logIn(t.client(), 'old', PASSWORD)).status).toBe(401);
  });

  it('an older database gets the salt column, and no legacy flag', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'se-old-db-'));
    const file = path.join(dir, 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', can_start_games INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0, session_epoch INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT 'now')`);
    old.close();
    const db = openDatabase(file);
    const columns = db
      .prepare('PRAGMA table_info(users)')
      .all()
      .map((c) => c.name);
    db.close();
    rmSync(dir, { recursive: true, force: true });
    expect(columns).toContain('kdf_salt');
    expect(columns).not.toContain('legacy');
  });
});
