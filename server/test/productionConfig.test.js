// ============================================================
// File:        productionConfig.test.js
// Path:        server/test/productionConfig.test.js
// Project:     Seasonal Entertainment
// Description: Production refuses development defaults (short session secret or bootstrap
//              token, http origin, insecure cookies) and starts with a proper set; behind the
//              reverse proxy (Caddy, TRUST_PROXY=1) the session cookie is the Secure __Host-
//              one only for requests the proxy marks as HTTPS, and each visitor's own address
//              (X-Forwarded-For) is what the per-IP limits count.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { registration } from './helpers/accountKeys.js';
import { makeTestApp } from './helpers/testApp.js';

const LONG = 'x'.repeat(32);
const PROD = {
  NODE_ENV: 'production',
  SESSION_SECRET: LONG,
  TRUST_PROXY: '1',
  PUBLIC_ORIGIN: 'https://se.example',
};

describe('production start', () => {
  it('starts with a proper set: secure cookies by default, the proxy trusted', () => {
    expect(readConfig(PROD)).toMatchObject({ cookieSecure: true, trustProxy: 1 });
    expect(readConfig({ ...PROD, BOOTSTRAP_TOKEN: LONG }).bootstrapToken).toBe(LONG);
  });

  it.each([
    ['a short session secret', { SESSION_SECRET: 'change-me' }, /SESSION_SECRET/],
    ['an http origin', { PUBLIC_ORIGIN: 'http://se.example' }, /https/],
    ['insecure cookies', { COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
    ['a short bootstrap token', { BOOTSTRAP_TOKEN: 'abc' }, /BOOTSTRAP_TOKEN/],
  ])('refuses %s', (_name, change, message) => {
    expect(() => readConfig({ ...PROD, ...change })).toThrow(message);
  });
});

describe('behind the reverse proxy', () => {
  let t;
  afterEach(() => t.close());
  const behindCaddy = () =>
    makeTestApp({
      trustProxy: 1,
      cookieSecure: true,
      rateLimits: { register: { windowMs: 60_000, max: 1 } },
    });
  const register = (agent, name, headers) =>
    registration(name, 'correct-horse-1').then((body) =>
      agent.post('/api/auth/register').set(headers).send(body)
    );

  it('sets the Secure __Host- cookie for HTTPS requests only', async () => {
    t = behindCaddy();
    const https = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.1' };
    const res = await register(t.client(), 'anna', https);
    expect(res.status).toBe(201);
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/^__Host-se\.sid=/);
    expect(cookie).toMatch(/; Secure/);
    // Plain http (a request around the proxy): no session cookie at all.
    const plain = await register(t.client(), 'ben', { 'X-Forwarded-For': '203.0.113.2' });
    expect(plain.status).toBe(201);
    expect(plain.headers['set-cookie']).toBeUndefined();
  });

  it("limits each visitor by their own address, not the proxy's", async () => {
    t = behindCaddy(); // one registration per address
    const from = (ip) => ({ 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': ip });
    expect((await register(t.client(), 'anna', from('203.0.113.1'))).status).toBe(201);
    expect((await register(t.client(), 'ben', from('203.0.113.1'))).status).toBe(429);
    expect((await register(t.client(), 'cleo', from('203.0.113.2'))).status).toBe(201);
  });
});
