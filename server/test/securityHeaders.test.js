// ============================================================
// File:        securityHeaders.test.js
// Path:        server/test/securityHeaders.test.js
// Project:     Seasonal Entertainment
// Description: Guards the security headers on API and page responses, and the client-route
//              fallback that serves index.html for deep links.
// ============================================================

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/testApp.js';

let t;
let clientDist;
beforeEach(() => {
  clientDist = mkdtempSync(path.join(tmpdir(), 'se-dist-'));
  writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>shell</title>');
  t = makeTestApp({ clientDist });
});
afterEach(() => {
  t.close();
  rmSync(clientDist, { recursive: true, force: true });
});

describe('security headers', () => {
  it('sends a strict Content-Security-Policy and the usual hardening headers', async () => {
    const res = await t.client().get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    // Scripts from this origin and WebAssembly (libsodium), nothing else: no JavaScript eval.
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc.trim().split(/\s+/)).toEqual(['script-src', "'self'", "'wasm-unsafe-eval'"]);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends them on page responses too', async () => {
    const res = await t.client().get('/events');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('client-route fallback', () => {
  it('serves index.html for a client route', async () => {
    const res = await t.client().get('/info/faq');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>shell</title>');
  });

  it('never serves the page for an unknown API path', async () => {
    const res = await t.client().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'not_found' });
  });
});
