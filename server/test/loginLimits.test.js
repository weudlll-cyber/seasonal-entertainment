// ============================================================
// File:        loginLimits.test.js
// Path:        server/test/loginLimits.test.js
// Project:     Seasonal Entertainment
// Description: Guards login protection that must hold behind a reverse proxy: production
//              refuses to start without TRUST_PROXY and PUBLIC_ORIGIN, and failed logins are
//              limited per username as well as per IP, with the same answers whether the
//              username exists or not.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('production start', () => {
  const prod = { NODE_ENV: 'production', SESSION_SECRET: 's' };

  it('refuses to start without TRUST_PROXY or a valid PUBLIC_ORIGIN', () => {
    expect(() => readConfig(prod)).toThrow(/TRUST_PROXY/);
    expect(() => readConfig({ ...prod, TRUST_PROXY: '1' })).toThrow(/PUBLIC_ORIGIN/);
    const withPath = { ...prod, TRUST_PROXY: '1', PUBLIC_ORIGIN: 'https://se.example/x' };
    expect(() => readConfig(withPath)).toThrow(/PUBLIC_ORIGIN/);
  });

  it('starts with both set (TRUST_PROXY=0 is an explicit "no proxy")', () => {
    const config = readConfig({ ...prod, TRUST_PROXY: '0', PUBLIC_ORIGIN: 'https://se.example' });
    expect(config).toMatchObject({ trustProxy: 0, publicOrigin: 'https://se.example' });
  });
});

describe('failed logins per username', () => {
  const login = (username, password = 'wrong-password-x') =>
    t.client().post('/api/auth/login').send({ username, password });

  it('locks one username after too many failures, whether it exists or not', async () => {
    t = makeTestApp({ rateLimits: { loginAccount: { windowMs: 60_000, max: 3 } } });
    await registerUser(t, 'anna', 'correct-horse-1');
    await registerUser(t, 'bob', 'correct-horse-1');
    for (const name of ['anna', 'nobody']) {
      for (let i = 0; i < 3; i++) expect((await login(name)).status).toBe(401);
    }
    const existing = await login('ANNA', 'correct-horse-1'); // names are case-insensitive
    const missing = await login('nobody');
    expect([existing.status, missing.status]).toEqual([429, 429]);
    expect(existing.body).toEqual(missing.body);
    // Another account from the same address is not affected.
    expect((await login('bob', 'correct-horse-1')).status).toBe(200);
  });
});
