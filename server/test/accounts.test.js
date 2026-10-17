// ============================================================
// File:        accounts.test.js
// Path:        server/test/accounts.test.js
// Project:     Seasonal Entertainment
// Description: Guards /api/auth: registration rules, login/logout, own password change
//              (other sessions end), rate limits, CSRF origin check and locked accounts. Every
//              request carries what a browser sends: salt and auth key, never the password
//              (helpers/accountKeys.js; the key split itself: loginKeySplit.test.js).
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { keysFor, logIn, registration } from './helpers/accountKeys.js';
import { ORIGIN, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const newAccount = (overrides = {}) => registration('anna', 'correct-horse-1', overrides);
const register = async (overrides) =>
  t
    .client()
    .post('/api/auth/register')
    .send(await newAccount(overrides));

describe('registration', () => {
  it('creates a member and logs them in', async () => {
    t = makeTestApp();
    const agent = t.client();
    const res = await agent.post('/api/auth/register').send(await newAccount());
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'anna', role: 'member', canStartGames: false });
    const session = await agent.get('/api/auth/session');
    expect(session.body.user.username).toBe('anna');
  });

  it('refuses a username that differs only in case', async () => {
    t = makeTestApp();
    await registerUser(t, 'anna');
    const res = await register({ username: 'ANNA', email: 'other@example.org' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('username_taken');
  });

  it.each([[undefined], [false], ['yes']])('requires the age checkbox (got %s)', async (value) => {
    t = makeTestApp();
    const res = await register({ ageConfirmed: value });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 14/);
  });

  it('refuses usernames outside the shared rules and malformed keys', async () => {
    t = makeTestApp();
    expect((await register({ username: '<script>' })).status).toBe(400);
    expect((await register({ authKey: 'short' })).status).toBe(400);
    expect((await register({ salt: undefined })).status).toBe(400);
  });
});

describe('login and logout', () => {
  it('logs in, and wrong password and unknown user get the same answer', async () => {
    t = makeTestApp();
    await registerUser(t, 'anna', 'correct-horse-1');
    expect((await logIn(t.client(), 'Anna', 'correct-horse-1')).status).toBe(200);
    const wrong = await logIn(t.client(), 'anna', 'nope-nope-nope');
    const unknown = await logIn(t.client(), 'nobody', 'nope-nope-nope');
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('logout ends the session', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/session')).body.user).toBeNull();
    expect((await agent.post('/api/auth/logout')).status).toBe(401);
  });

  it('rate-limits failed logins, and successful ones do not count', async () => {
    t = makeTestApp({ rateLimits: { login: { windowMs: 60_000, max: 3 } } });
    await registerUser(t, 'anna', 'correct-horse-1');
    const login = (password) => logIn(t.client(), 'anna', password);
    await login('correct-horse-1');
    await login('correct-horse-1');
    for (let i = 0; i < 3; i++) expect((await login('wrong-password')).status).toBe(401);
    const blocked = await login('wrong-password');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('too_many_attempts');
  });

  it('a locked account cannot log in and its open session ends', async () => {
    t = makeTestApp();
    const { agent, user } = await registerUser(t, 'anna', 'correct-horse-1');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(user.id);
    expect((await agent.get('/api/auth/session')).body.user).toBeNull();
    const res = await logIn(t.client(), 'anna', 'correct-horse-1');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('account_locked');
  });
});

// The body of an own password change: the current password proven by its auth key, the new
// one as a new salt and auth key.
async function passwordChange(current, next, newSalt = 'bmV3LXNhbHQtLTE2Ynl0ZQ==') {
  const { authKey: currentAuthKey } = await keysFor(current);
  const { authKey: newAuthKey } = await keysFor(next, newSalt);
  return { currentAuthKey, newSalt, newAuthKey };
}

describe('own password change', () => {
  it('ends every other session of the account and keeps this one', async () => {
    t = makeTestApp();
    const { agent: here } = await registerUser(t, 'anna', 'correct-horse-1');
    const elsewhere = t.client();
    await logIn(elsewhere, 'anna', 'correct-horse-1');
    const body = await passwordChange('correct-horse-1', 'battery-staple-2');
    const res = await here.post('/api/auth/password').send(body);
    expect(res.status).toBe(200);
    expect((await here.get('/api/auth/session')).body.user.username).toBe('anna');
    expect((await elsewhere.get('/api/auth/session')).body.user).toBeNull();
    // The new salt is what the browser gets for its next login.
    const pre = await t.client().post('/api/auth/prelogin').send({ username: 'anna' });
    expect(pre.body.salt).toBe(body.newSalt);
    const relogin = await t
      .client()
      .post('/api/auth/login')
      .send({ username: 'anna', authKey: body.newAuthKey });
    expect(relogin.status).toBe(200);
  });

  it('refuses a wrong current password and changes nothing', async () => {
    t = makeTestApp();
    const { agent } = await registerUser(t, 'anna', 'correct-horse-1');
    const body = await passwordChange('wrong-wrong-1', 'battery-staple-2');
    const res = await agent.post('/api/auth/password').send(body);
    expect(res.status).toBe(401);
    expect((await agent.get('/api/auth/session')).body.user).not.toBeNull();
    expect((await logIn(t.client(), 'anna', 'correct-horse-1')).status).toBe(200);
  });
});

describe('CSRF origin check', () => {
  it('refuses a state-changing request without or with a foreign Origin', async () => {
    t = makeTestApp();
    const none = await t.client().post('/api/auth/login').unset('Origin').send({});
    expect(none.status).toBe(403);
    expect(none.body.error).toBe('origin_required');
    const foreign = await t
      .client()
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({});
    expect(foreign.status).toBe(403);
    expect(foreign.body.error).toBe('cross_origin');
    const own = await t.client().post('/api/auth/login').set('Origin', ORIGIN).send({});
    expect(own.status).toBe(400);
  });
});
