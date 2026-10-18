// ============================================================
// File:        twoFactorSessions.test.js
// Path:        server/test/twoFactorSessions.test.js
// Project:     Seasonal Entertainment
// Description: Guards 2FA session hygiene: starting (or restarting) the setup needs the
//              current password; turning 2FA on or off ends every other session of the account
//              and keeps the one making the change; a half-finished 2FA login dies with a
//              password reset (session epoch).
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { codeForStep, stepAt } from '../src/twofa/totp.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const PASSWORD = 'correct-horse-1';
const codeNow = (secret, offset = 0) => codeForStep(secret, stepAt(Date.now()) + offset);
const signedInAs = async (agent) => (await agent.get('/api/auth/session')).body.user?.username;

async function login(factor) {
  const agent = t.client();
  await agent.post('/api/auth/login').send({ username: 'anna', password: PASSWORD });
  if (factor) await agent.post('/api/2fa/login').send(factor);
  return agent;
}

async function turnOn(agent) {
  const setup = await agent.post('/api/2fa/setup').send({ password: PASSWORD });
  const enable = await agent.post('/api/2fa/enable').send({ code: codeNow(setup.body.secret) });
  return { secret: setup.body.secret, recoveryCodes: enable.body.recoveryCodes };
}

describe('setup needs the current password', () => {
  it('refuses a missing or wrong password, accepts the right one', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    expect((await agent.post('/api/2fa/setup')).status).toBe(400);
    const wrong = await agent.post('/api/2fa/setup').send({ password: 'not-the-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body).not.toHaveProperty('secret');
    expect((await agent.post('/api/2fa/setup').send({ password: PASSWORD })).status).toBe(200);
  });
});

describe('turning 2FA on or off ends the other sessions', () => {
  it('on: the other session is logged out, this one stays', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const other = await login();
    expect(await signedInAs(other)).toBe('anna');
    await turnOn(agent);
    expect(await signedInAs(other)).toBeUndefined();
    expect(await signedInAs(agent)).toBe('anna');
  });

  it('off: the other session is logged out, this one stays', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', PASSWORD);
    const { secret, recoveryCodes } = await turnOn(agent);
    const other = await login({ recoveryCode: recoveryCodes[0] });
    expect(await signedInAs(other)).toBe('anna');
    const off = await agent
      .post('/api/2fa/disable')
      .send({ password: PASSWORD, code: codeNow(secret, 1) });
    expect(off.status).toBe(200);
    expect(await signedInAs(other)).toBeUndefined();
    expect(await signedInAs(agent)).toBe('anna');
  });
});

describe('a pending 2FA login', () => {
  it('cannot be finished after a password reset', async () => {
    t = makeTestApp();
    const { agent: admin } = await makeStaff(t, 'adam', 'admin');
    const { agent, user } = await registerUser(t, 'anna', PASSWORD);
    const { secret } = await turnOn(agent);
    const half = t.client();
    await half.post('/api/auth/login').send({ username: 'anna', password: PASSWORD });
    await admin.post(`/api/admin/users/${user.id}/password`).send({ newPassword: 'new-horse-22' });
    const finish = await half.post('/api/2fa/login').send({ code: codeNow(secret, 1) });
    expect(finish.status).toBe(401);
    expect(finish.body.error).toBe('login_expired');
    expect(await signedInAs(half)).toBeUndefined();
  });
});
