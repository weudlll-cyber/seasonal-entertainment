// ============================================================
// File:        twoFactorAtRest.test.js
// Path:        server/test/twoFactorAtRest.test.js
// Project:     Seasonal Entertainment
// Description: 2FA secrets encrypted at rest (twofa/secretBox.js, SECRET_ENCRYPTION_KEY): the
//              secret shown at setup is nowhere in the database; an account enabled before the
//              encryption (a plain-text row) logs in before and after the start-up migration;
//              the migration encrypts once and never again; another key refuses the code (not
//              the recovery codes) with a clear log line, and the migration reports it; the key
//              is required in production, must be 32 bytes, and development says when it uses
//              the public development key.
// ============================================================

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { DEV_SECRET_KEY, readSecretKey } from '../src/secretKey.js';
import { sealStoredSecrets } from '../src/twofa/secretBox.js';
import { codeForStep, stepAt } from '../src/twofa/totp.js';
import { logIn, proof } from './helpers/accountKeys.js';
import { ORIGIN, TEST_SECRET_KEY, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => {
  vi.restoreAllMocks();
  t?.close();
});

const PASSWORD = 'correct-horse-1';
const OTHER_KEY = new Uint8Array(32).fill(7);
const codeNow = (secret) => codeForStep(secret, stepAt(Date.now()));
// The enable step used up the current code (the replay guard); a login starts afresh.
const forgetUsedCodes = () => t.db.prepare('UPDATE two_factor SET last_step = 0').run();
const storedSecret = () => t.db.prepare('SELECT secret FROM two_factor').get().secret;
const dump = () =>
  t.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .flatMap(({ name }) => t.db.prepare(`SELECT * FROM ${name}`).all())
    .map((row) => JSON.stringify(row))
    .join('\n');

async function enable(agent) {
  const setup = await agent.post('/api/2fa/setup').send(await proof(PASSWORD));
  const enabled = await agent.post('/api/2fa/enable').send({ code: codeNow(setup.body.secret) });
  expect(enabled.status).toBe(200);
  return { secret: setup.body.secret, recoveryCodes: enabled.body.recoveryCodes };
}

// The two login steps on a fresh agent of `app`; returns the second step's response.
async function logInWith(app, factor) {
  const agent = request.agent(app).set('Origin', ORIGIN);
  expect((await logIn(agent, 'anna', PASSWORD)).body.twoFactorRequired).toBe(true);
  return agent.post('/api/2fa/login').send(factor);
}

// The same database under another SECRET_ENCRYPTION_KEY (a wrong key after a move).
const appWithKey = (secretKey) =>
  createApp({
    buildInfo: { version: '9.9.9', commit: 'abc' },
    config: { ...t.config, secretKey },
    db: t.db,
    previewNetwork: { resolve: async () => [], connect: () => null },
  });

it('stores the secret encrypted: the one shown at setup is nowhere in the database', async () => {
  t = makeTestApp();
  const { agent } = await registerUser(t, 'anna', PASSWORD);
  const { secret } = await enable(agent);
  expect(storedSecret()).toMatch(/^enc1:/);
  expect(dump()).not.toContain(secret);
  forgetUsedCodes();
  expect((await logInWith(t.app, { code: codeNow(secret) })).status).toBe(200);
});

it('an account from before the encryption logs in before and after the migration', async () => {
  t = makeTestApp();
  const { agent } = await registerUser(t, 'anna', PASSWORD);
  const { secret } = await enable(agent);
  // As an older database holds it: the secret in plain text.
  t.db.prepare('UPDATE two_factor SET secret = ?, last_step = 0').run(secret);
  // Before the migration (the server has not started since): refused, never read as plain text.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await logInWith(t.app, { code: codeNow(secret) })).status).toBe(401);

  const log = [];
  expect(await sealStoredSecrets(t.db, t.config.secretKey, (l) => log.push(l))).toEqual({
    sealed: 1,
    unreadable: 0,
  });
  expect(log).toEqual(['[2fa] encrypted 1 stored 2FA secrets (first start with encryption)']);
  expect(storedSecret()).toMatch(/^enc1:/);
  expect((await logInWith(t.app, { code: codeNow(secret) })).status).toBe(200);
});

it('migrates once: a second start changes nothing', async () => {
  t = makeTestApp();
  const { agent } = await registerUser(t, 'anna', PASSWORD);
  await enable(agent);
  const before = storedSecret();
  expect(await sealStoredSecrets(t.db, t.config.secretKey, () => {})).toEqual({
    sealed: 0,
    unreadable: 0,
  });
  expect(storedSecret()).toBe(before);
});

it('another key refuses the code with a clear log line; recovery codes still work', async () => {
  t = makeTestApp();
  const { agent } = await registerUser(t, 'anna', PASSWORD);
  const { secret, recoveryCodes } = await enable(agent);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const wrongKey = appWithKey(OTHER_KEY);
  forgetUsedCodes();

  const refused = await logInWith(wrongKey, { code: codeNow(secret) });
  expect(refused.status).toBe(401);
  const line = errors.mock.calls.map((c) => c.join(' ')).join('\n');
  expect(line).toMatch(/2FA secret of user \d+ cannot be decrypted: SECRET_ENCRYPTION_KEY/);
  expect(line).not.toContain(secret);
  // Recovery codes are hashed, not encrypted: the way back in stays open.
  expect((await logInWith(wrongKey, { recoveryCode: recoveryCodes[0] })).status).toBe(200);
  // The very same code passes with the right key: it was the key that refused it.
  expect((await logInWith(t.app, { code: codeNow(secret) })).status).toBe(200);

  const log = [];
  expect(await sealStoredSecrets(t.db, OTHER_KEY, (l) => log.push(l))).toEqual({
    sealed: 0,
    unreadable: 1,
  });
  expect(log[0]).toMatch(/1 stored 2FA secrets do not open with SECRET_ENCRYPTION_KEY/);
});

describe('SECRET_ENCRYPTION_KEY', () => {
  const prod = {
    NODE_ENV: 'production',
    SESSION_SECRET: 's'.repeat(32),
    TRUST_PROXY: '1',
    PUBLIC_ORIGIN: 'https://se.example',
  };

  it('is required in production and must not be the development key', () => {
    expect(() => readConfig(prod)).toThrow(/SECRET_ENCRYPTION_KEY is required in production/);
    expect(() => readConfig({ ...prod, SECRET_ENCRYPTION_KEY: DEV_SECRET_KEY })).toThrow(
      /development SECRET_ENCRYPTION_KEY/
    );
    expect(readConfig({ ...prod, SECRET_ENCRYPTION_KEY: TEST_SECRET_KEY }).secretKey).toHaveLength(
      32
    );
  });

  it('must be 32 bytes as base64', () => {
    for (const bad of ['short', Buffer.alloc(16).toString('base64'), `${TEST_SECRET_KEY}!`]) {
      expect(() => readSecretKey(bad, false)).toThrow(/32 bytes as base64/);
    }
  });

  it('development without it uses the public development key and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readSecretKey(undefined, false)).toEqual(readSecretKey(DEV_SECRET_KEY, false));
    expect(warn.mock.calls.join(' ')).toMatch(/public development key; 2FA secrets are NOT/);
  });
});
