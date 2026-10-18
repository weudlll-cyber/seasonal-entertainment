// ============================================================
// File:        twoFactor.test.js
// Path:        server/test/twoFactor.test.js
// Project:     Seasonal Entertainment
// Description: Guards two-factor authentication: setup with valid/invalid codes, login in
//              two steps, replayed codes refused, recovery codes usable once, and the staff
//              requirement (organiser actions refused until 2FA is set up).
// ============================================================

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { findUserById } from '../src/accounts/userStore.js';
import { readConfig } from '../src/config.js';
import { allow } from '../src/http/access.js';
import { staffTwoFactorGate } from '../src/twofa/gate.js';
import { codeForStep, stepAt } from '../src/twofa/totp.js';
import { logIn, proof } from './helpers/accountKeys.js';
import { makeTestApp, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const PASSWORD = 'correct-horse-1';
const codeNow = (secret, offset = 0) => codeForStep(secret, stepAt(Date.now()) + offset);

async function enableTwoFactor(agent) {
  const setup = await agent.post('/api/2fa/setup').send(await proof(PASSWORD));
  expect(setup.status).toBe(200);
  expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);
  const enable = await agent.post('/api/2fa/enable').send({ code: codeNow(setup.body.secret) });
  expect(enable.status).toBe(200);
  return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
}

const loginStep1 = () => logIn(t.client(), 'anna', PASSWORD);

async function loginWith(factor) {
  const agent = t.client();
  await logIn(agent, 'anna', PASSWORD);
  const res = await agent.post('/api/2fa/login').send(factor);
  return { agent, res };
}

describe('setup', () => {
  it('enables 2FA with a valid code and returns ten recovery codes once', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const { recoveryCodes } = await enableTwoFactor(agent);
    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect((await agent.get('/api/auth/session')).body.user.twoFactorEnabled).toBe(true);
    // Stored hashed, never in plain text.
    const stored = t.db.prepare('SELECT code_hash FROM recovery_codes').all();
    expect(stored.map((r) => r.code_hash)).not.toContain(recoveryCodes[0]);
  });

  it('refuses an invalid code and stays off', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const setup = await agent.post('/api/2fa/setup').send(await proof(PASSWORD));
    const wrong = String((Number(codeNow(setup.body.secret)) + 1) % 1e6).padStart(6, '0');
    const res = await agent.post('/api/2fa/enable').send({ code: wrong });
    expect(res.status).toBe(400);
    expect((await agent.get('/api/auth/session')).body.user.twoFactorEnabled).toBe(false);
  });
});

describe('login with 2FA', () => {
  it('the password alone does not log in; the code finishes it', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const { secret } = await enableTwoFactor(agent);
    const half = t.client();
    const step1 = await logIn(half, 'anna', PASSWORD);
    expect(step1.body).toEqual({ ok: true, twoFactorRequired: true });
    expect((await half.get('/api/auth/session')).body.user).toBeNull();
    const step2 = await half.post('/api/2fa/login').send({ code: codeNow(secret, 1) });
    expect(step2.status).toBe(200);
    expect((await half.get('/api/auth/session')).body.user.username).toBe('anna');
  });

  it('refuses a replayed code', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const { secret } = await enableTwoFactor(agent);
    const code = codeNow(secret, 1);
    expect((await loginWith({ code })).res.status).toBe(200);
    expect((await loginWith({ code })).res.status).toBe(401);
  });

  it('a recovery code works exactly once', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const { recoveryCodes } = await enableTwoFactor(agent);
    const first = await loginWith({ recoveryCode: recoveryCodes[3].toUpperCase() });
    expect(first.res.status).toBe(200);
    expect((await loginWith({ recoveryCode: recoveryCodes[3] })).res.status).toBe(401);
  });

  it('the second step without a pending login is refused', async () => {
    t = makeTestApp();
    const res = await t.client().post('/api/2fa/login').send({ code: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('login_expired');
  });

  it('a wrong code does not log in', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    await enableTwoFactor(agent);
    expect((await loginStep1()).body.twoFactorRequired).toBe(true);
    expect((await loginWith({ code: '000000' })).res.status).toBe(401);
  });
});

describe('disable', () => {
  it('needs the password and a valid second factor', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const { secret } = await enableTwoFactor(agent);
    const noCode = await agent.post('/api/2fa/disable').send(await proof(PASSWORD));
    expect(noCode.status).toBe(401);
    const ok = await agent
      .post('/api/2fa/disable')
      .send({ ...(await proof(PASSWORD)), code: codeNow(secret, 1) });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/session')).body.user.twoFactorEnabled).toBe(false);
  });
});

describe('staff requirement', () => {
  // The real gate and allow() around a probe organiser route, as the real staff routes use.
  const probe = (config, user) => {
    const app = express();
    app.use((req, _res, next) => ((req.user = user), next()));
    app.use(staffTwoFactorGate(t.db, config));
    app.post('/organiser-action', allow('organiser'), (_req, res) => res.json({ ok: true }));
    return request(app).post('/organiser-action');
  };

  it('refuses organiser actions until 2FA is set up, then allows them', async () => {
    t = makeTestApp();
    const { agent, user } = await registerUser(t, 'anna', PASSWORD);
    setRole(t, user.id, 'organiser');
    const session = await agent.get('/api/auth/session');
    expect(session.body.user.twoFactorRequired).toBe(true);
    const refused = await probe(t.config, findUserById(t.db, user.id));
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('two_factor_required');
    await enableTwoFactor(agent);
    expect((await probe(t.config, findUserById(t.db, user.id))).status).toBe(200);
    expect((await agent.get('/api/auth/session')).body.user.twoFactorRequired).toBe(false);
  });

  it('members are not required to use 2FA; the dev switch lifts the staff rule', async () => {
    t = makeTestApp();
    const { agent, user } = await registerUser(t, 'anna', PASSWORD);
    expect((await agent.get('/api/auth/session')).body.user.twoFactorRequired).toBe(false);
    setRole(t, user.id, 'organiser');
    const devConfig = { ...t.config, requireStaff2fa: false };
    expect((await probe(devConfig, findUserById(t.db, user.id))).status).toBe(200);
  });

  it('the requirement cannot be switched off in production', () => {
    expect(() =>
      readConfig({ NODE_ENV: 'production', SESSION_SECRET: 's', REQUIRE_STAFF_2FA: 'false' })
    ).toThrow(/not allowed in production/);
  });
});
