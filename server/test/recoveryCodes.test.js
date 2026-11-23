// ============================================================
// File:        recoveryCodes.test.js
// Path:        server/test/recoveryCodes.test.js
// Project:     Seasonal Entertainment
// Description: 2FA recovery codes keyed with RECOVERY_CODE_KEY (twofa/store.js, the scheme of
//              seasonal-kit's recoveryCodes.ts; decided 2026-11-22): new codes are stored as
//              HMAC-SHA-256 under the key, marked 'hmac'; codes stored before as plain SHA-256
//              ('legacy', also what the migration gives an older table's rows) still work once
//              each; a used code is refused; a code stored under another key is refused; and
//              production refuses to start without the key or with the development one.
// ============================================================

import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/config.js';
import { openDatabase } from '../src/db/database.js';
import { DEV_RECOVERY_CODE_KEY, readSecretKey } from '../src/secretKey.js';
import { sealSecret } from '../src/twofa/secretBox.js';
import { acceptSecondFactor, enableTwoFactor, savePendingSecret } from '../src/twofa/store.js';
import {
  STAFF_TOTP_SECRET,
  TEST_RECOVERY_CODE_KEY,
  TEST_SECRET_KEY,
  makeTestApp,
  registerUser,
} from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

// An account with 2FA on, as the setup leaves it; returns its id and its recovery codes.
async function withTwoFactor() {
  t = makeTestApp();
  const { user } = await registerUser(t);
  savePendingSecret(t.db, user.id, await sealSecret(STAFF_TOTP_SECRET, t.config.secretKey));
  return { id: user.id, codes: enableTwoFactor(t.db, t.config.recoveryCodeKey, user.id, 0) };
}
const recover = (id, recoveryCode, keys = t.config) =>
  acceptSecondFactor(t.db, keys, id, { recoveryCode });
const rowsOf = (id) =>
  t.db.prepare('SELECT code_hash, scheme FROM recovery_codes WHERE user_id = ?').all(id);
const cleaned = (code) => code.replace('-', '');

describe('new recovery codes', () => {
  it('are stored as HMAC-SHA-256 under RECOVERY_CODE_KEY, never as plain SHA-256', async () => {
    const { id, codes } = await withTwoFactor();
    const key = Buffer.from(TEST_RECOVERY_CODE_KEY, 'base64');
    const hmac = (code) => createHmac('sha256', key).update(cleaned(code)).digest('hex');
    const sha = (code) => createHash('sha256').update(cleaned(code)).digest('hex');
    expect(rowsOf(id)).toEqual(codes.map((code) => ({ code_hash: hmac(code), scheme: 'hmac' })));
    expect(rowsOf(id).some((row) => codes.some((c) => row.code_hash === sha(c)))).toBe(false);
  });

  it('work once each, typed with spaces or capitals too', async () => {
    const { id, codes } = await withTwoFactor();
    expect(await recover(id, ` ${codes[0].toUpperCase().replace('-', ' ')} `)).toBe(true);
    expect(await recover(id, codes[0])).toBe(false);
    expect(await recover(id, codes[1])).toBe(true);
  });

  it('are refused under another RECOVERY_CODE_KEY, and still work under their own', async () => {
    const { id, codes } = await withTwoFactor();
    const other = { ...t.config, recoveryCodeKey: readSecretKey(TEST_SECRET_KEY, false) };
    expect(await recover(id, codes[0], other)).toBe(false);
    expect(await recover(id, codes[0])).toBe(true);
  });
});

describe('recovery codes issued before 2026-11-22 (plain SHA-256)', () => {
  it('still work, once each, without an end date', async () => {
    const { id } = await withTwoFactor();
    const legacy = 'abcd-efgh';
    const hash = createHash('sha256').update('abcdefgh').digest('hex');
    // As an older table holds it: no scheme given, so the column's default.
    t.db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)').run(id, hash);
    expect(rowsOf(id).at(-1)).toEqual({ code_hash: hash, scheme: 'legacy' });
    expect(await recover(id, 'ABCD EFGH')).toBe(true);
    expect(await recover(id, legacy)).toBe(false);
  });

  it("a legacy hash is not taken for a keyed row's (each row in its own scheme)", async () => {
    const { id } = await withTwoFactor();
    const sha = createHash('sha256').update('wxyz2345').digest('hex');
    t.db
      .prepare("INSERT INTO recovery_codes (user_id, code_hash, scheme) VALUES (?, ?, 'hmac')")
      .run(id, sha);
    expect(await recover(id, 'wxyz-2345')).toBe(false);
  });

  it('an older database gets the scheme column, its codes marked legacy', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'se-recovery-'));
    const file = path.join(dir, 'old.db');
    const old = new Database(file);
    old.exec(`CREATE TABLE recovery_codes (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
        code_hash TEXT NOT NULL, used_at TEXT);
      INSERT INTO recovery_codes (user_id, code_hash) VALUES (1, 'aa'), (1, 'bb');`);
    old.close();
    const db = openDatabase(file);
    try {
      expect(db.prepare('SELECT scheme FROM recovery_codes').all()).toEqual([
        { scheme: 'legacy' },
        { scheme: 'legacy' },
      ]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('RECOVERY_CODE_KEY', () => {
  const prod = {
    NODE_ENV: 'production',
    SESSION_SECRET: 's'.repeat(32),
    TRUST_PROXY: '1',
    PUBLIC_ORIGIN: 'https://se.example',
    SECRET_ENCRYPTION_KEY: TEST_SECRET_KEY,
  };

  it('production refuses to start without it or with the development key, naming no secret', () => {
    let message = '';
    try {
      readConfig(prod);
    } catch (error) {
      message = error.message;
    }
    expect(message).toBe('[config] RECOVERY_CODE_KEY is required in production');
    expect(() => readConfig({ ...prod, RECOVERY_CODE_KEY: DEV_RECOVERY_CODE_KEY })).toThrow(
      /development RECOVERY_CODE_KEY is not allowed/
    );
    const config = readConfig({ ...prod, RECOVERY_CODE_KEY: TEST_RECOVERY_CODE_KEY });
    expect(config.recoveryCodeKey).toEqual(readSecretKey(TEST_RECOVERY_CODE_KEY, false));
  });

  it('must be 32 bytes as base64, and the message never holds the value', () => {
    const short = Buffer.from('sixteen-bytes-!!').toString('base64');
    expect(() => readSecretKey(short, false, 'RECOVERY_CODE_KEY')).toThrow(
      '[config] RECOVERY_CODE_KEY must be 32 bytes as base64'
    );
  });

  it('development without it uses the public development key and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const key = readSecretKey(undefined, false, 'RECOVERY_CODE_KEY');
    expect(key).toEqual(readSecretKey(DEV_RECOVERY_CODE_KEY, false, 'RECOVERY_CODE_KEY'));
    expect(warn.mock.calls.join(' ')).toMatch(
      /RECOVERY_CODE_KEY not set: using the public development key; recovery codes are NOT/
    );
    warn.mockRestore();
  });
});
