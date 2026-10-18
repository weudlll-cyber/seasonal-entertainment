// ============================================================
// File:        loginKeySplit.test.js
// Path:        server/test/loginKeySplit.test.js
// Project:     Seasonal Entertainment
// Description: Guards the login key split (docs/AUTH.md): pre-login answers have the same shape
//              for known and unknown usernames (a stable fake salt for unknown ones); the server
//              stores bcrypt of the auth key and never accepts a password on the normal routes;
//              a legacy account logs in once through the legacy route, which upgrades it exactly
//              once, and only legacy accounts may use it; wrong secrets get the same 401 and
//              count towards the lockout; older databases have their accounts marked legacy.
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
// The new salt a legacy account's browser sends with its upgrade.
const FRESH_SALT = 'ZnJlc2gtc2FsdC0xNmJ5dA==';
const prelogin = (username) => t.client().post('/api/auth/prelogin').send({ username });
const shape = (body) => ({
  keys: Object.keys(body).sort(),
  saltBytes: Buffer.from(body.salt, 'base64').length,
});

// An account as it was before the key split: bcrypt of the password itself, no salt.
async function legacyAccount(username) {
  const hash = await bcrypt.hash(PASSWORD, 4);
  t.db
    .prepare(
      `INSERT INTO users (username, email, password_hash, kdf_salt, legacy)
       VALUES (?, ?, ?, NULL, 1)`
    )
    .run(username, `${username}@example.org`, hash);
}

async function legacyLogin(username, password = PASSWORD) {
  const { authKey } = await keysFor(PASSWORD, FRESH_SALT);
  const res = await t
    .client()
    .post('/api/auth/legacy-login')
    .send({ username, password, salt: FRESH_SALT, authKey });
  return { res, authKey, salt: FRESH_SALT };
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
    expect(shape(known.body)).toEqual({ keys: ['legacy', 'ok', 'salt'], saltBytes: 16 });
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
      .prepare('SELECT password_hash AS h, kdf_salt AS s, legacy FROM users WHERE id = ?')
      .get(user.id);
    const { salt, authKey } = await keysFor(PASSWORD);
    expect(row).toMatchObject({ s: salt, legacy: 0 });
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

  it('a new account never uses the legacy route', async () => {
    t = makeTestApp();
    await registerUser(t, 'anna', PASSWORD);
    const { res } = await legacyLogin('anna');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
    // Not even with its auth key in the password field (that is what its hash is of).
    const { authKey } = await keysFor(PASSWORD);
    const sneaky = await t
      .client()
      .post('/api/auth/legacy-login')
      .send({ username: 'anna', password: authKey, salt: FRESH_SALT, authKey });
    expect(sneaky.status).toBe(401);
  });
});

describe('legacy accounts', () => {
  it('log in once through the legacy route, which upgrades them exactly once', async () => {
    t = makeTestApp();
    await legacyAccount('old');
    expect((await prelogin('old')).body.legacy).toBe(true);
    // The normal route cannot open it: its hash is still of the password.
    expect((await logIn(t.client(), 'old', PASSWORD)).status).toBe(401);

    const first = await legacyLogin('old');
    expect(first.res.status).toBe(200);
    expect(first.res.body.user.username).toBe('old');
    const row = t.db
      .prepare("SELECT kdf_salt AS s, legacy FROM users WHERE username = 'old'")
      .get();
    expect(row).toEqual({ s: first.salt, legacy: 0 });
    expect((await prelogin('old')).body).toEqual({ ok: true, salt: first.salt, legacy: false });

    // Upgraded: the legacy route is closed for it, the normal one open.
    expect((await legacyLogin('old')).res.status).toBe(401);
    const normal = await t
      .client()
      .post('/api/auth/login')
      .send({ username: 'old', authKey: first.authKey });
    expect(normal.status).toBe(200);
  });

  it('a wrong password fails with the same error and counts towards the lockout', async () => {
    t = makeTestApp({ rateLimits: { loginAccount: { windowMs: 60_000, max: 2 } } });
    await legacyAccount('old');
    const wrong = await legacyLogin('old', 'wrong-password-1');
    const unknown = await logIn(t.client(), 'nobody', PASSWORD);
    expect(wrong.res.status).toBe(401);
    expect(wrong.res.body).toEqual(unknown.body);
    await legacyLogin('old', 'wrong-password-1');
    expect((await legacyLogin('old')).res.status).toBe(429);
    expect(t.db.prepare("SELECT legacy FROM users WHERE username = 'old'").get().legacy).toBe(1);
  });

  it('an older database has its accounts marked legacy; new accounts are not', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'se-legacy-'));
    const file = path.join(dir, 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', can_start_games INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0, session_epoch INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT 'now')`);
    old
      .prepare("INSERT INTO users (username, email, password_hash) VALUES ('old', 'o@x.org', 'h')")
      .run();
    old.close();
    const db = openDatabase(file);
    db.prepare(
      "INSERT INTO users (username, email, password_hash, kdf_salt) VALUES ('new', 'n@x.org', 'h', 's')"
    ).run();
    // Opening again does not mark anything a second time.
    db.close();
    const again = openDatabase(file);
    const rows = again.prepare('SELECT username, legacy FROM users ORDER BY id').all();
    again.close();
    rmSync(dir, { recursive: true, force: true });
    expect(rows).toEqual([
      { username: 'old', legacy: 1 },
      { username: 'new', legacy: 0 },
    ]);
  });
});
