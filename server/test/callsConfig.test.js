// ============================================================
// File:        callsConfig.test.js
// Path:        server/test/callsConfig.test.js
// Project:     Seasonal Entertainment
// Description: The call service configuration (calls/config.js, docs/CALLS.md): no keys means
//              the feature is off; keys must come together and the URL must be a ws(s)
//              origin; production refuses ws://, LiveKit's development key and secret, and a
//              short secret. The headers: the CSP's connect-src holds exactly this origin and
//              the call service's origin (none without calls); Permissions-Policy allows
//              camera, microphone and screen capture for this origin only.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { makeTestApp } from './helpers/testApp.js';

const PROD_BASE = {
  NODE_ENV: 'production',
  SESSION_SECRET: 's',
  TRUST_PROXY: '1',
  PUBLIC_ORIGIN: 'https://se.example.org',
};
const STRONG = 'a-long-production-secret-of-40-characters';
const calls = (url, key, secret) => ({
  CALLS_URL: url,
  CALLS_API_KEY: key,
  CALLS_API_SECRET: secret,
});

describe('call service configuration', () => {
  it('is off without keys', () => {
    expect(readConfig({}).calls).toBeNull();
    expect(readConfig({ ...PROD_BASE }).calls).toBeNull();
  });

  it('reads all three keys, with the http origin of the same host', () => {
    expect(readConfig(calls('ws://localhost:7880', 'devkey', 'secret')).calls).toEqual({
      url: 'ws://localhost:7880',
      httpOrigin: 'http://localhost:7880',
      apiKey: 'devkey',
      apiSecret: 'secret',
    });
  });

  it('refuses to start with only some keys', () => {
    expect(() => readConfig({ CALLS_URL: 'ws://localhost:7880' })).toThrow(/set together/);
    expect(() => readConfig(calls('', 'key', 'secret'))).toThrow(/set together/);
  });

  it('refuses a URL that is not a ws(s) origin', () => {
    expect(() => readConfig(calls('https://calls.example.org', 'k', 's'))).toThrow(/ws/);
    expect(() => readConfig(calls('wss://calls.example.org/rtc', 'k', 's'))).toThrow(/path/);
  });

  it('refuses development keys, ws:// and short secrets in production', () => {
    const prod = (url, key, secret) => () =>
      readConfig({ ...PROD_BASE, ...calls(url, key, secret) });
    expect(prod('wss://calls.example.org', 'devkey', STRONG)).toThrow(/development/);
    expect(prod('wss://calls.example.org', 'APIkey1', 'secret')).toThrow(/development/);
    expect(prod('ws://calls.example.org', 'APIkey1', STRONG)).toThrow(/wss/);
    expect(prod('wss://calls.example.org', 'APIkey1', 'short-secret')).toThrow(/32/);
    expect(prod('wss://calls.example.org', 'APIkey1', STRONG)()).toMatchObject({
      calls: { url: 'wss://calls.example.org', httpOrigin: 'https://calls.example.org' },
    });
  });
});

describe('headers for calls', () => {
  let t;
  afterEach(() => t.close());
  const connectSrc = (res) =>
    res.headers['content-security-policy']
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .find(([name]) => name === 'connect-src');

  it('connects only to this origin without calls', async () => {
    t = makeTestApp();
    const res = await t.client().get('/api/health');
    expect(connectSrc(res)).toEqual(['connect-src', "'self'"]);
  });

  it('adds exactly the call service origin', async () => {
    t = makeTestApp({
      calls: { url: 'wss://calls.example.org', httpOrigin: 'https://calls.example.org' },
    });
    const res = await t.client().get('/api/health');
    expect(connectSrc(res)).toEqual([
      'connect-src',
      "'self'",
      'wss://calls.example.org',
      'https://calls.example.org',
    ]);
    // Nothing else loosened: scripts, images and frames stay as strict as without calls.
    expect(res.headers['content-security-policy'].match(/calls\.example\.org/g)).toHaveLength(2);
  });

  it('lets only this origin use camera, microphone and screen capture', async () => {
    t = makeTestApp();
    const res = await t.client().get('/api/health');
    expect(res.headers['permissions-policy']).toBe(
      'camera=(self), microphone=(self), display-capture=(self)'
    );
  });
});
