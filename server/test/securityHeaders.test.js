// ============================================================
// File:        securityHeaders.test.js
// Path:        server/test/securityHeaders.test.js
// Project:     Seasonal Entertainment
// Description: Guards the security headers on API and page responses, who may frame what
//              (frame-ancestors 'self' for the embedded chat under /embed/ only, 'none'
//              elsewhere), and the client-route fallback that serves index.html for deep links.
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

describe('framing (frame-ancestors per route)', () => {
  const ancestors = async (url) => {
    const csp = (await t.client().get(url)).headers['content-security-policy'];
    return csp
      .split(';')
      .find((d) => d.trim().startsWith('frame-ancestors'))
      .trim();
  };

  it("lets only this site's own pages frame the embedded chat", async () => {
    const res = await t.client().get('/embed/chat?room=general&theme=dark');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>shell</title>');
    expect(await ancestors('/embed/chat?room=general')).toBe("frame-ancestors 'self'");
    // Otherwise the same policy as every page.
    const embed = res.headers['content-security-policy'].replace(/frame-ancestors [^;]+/, '');
    const page = (await t.client().get('/events')).headers['content-security-policy'];
    expect(embed).toBe(page.replace(/frame-ancestors [^;]+/, ''));
  });

  it('frames nothing else: pages, look-alike paths and the API stay unframeable', async () => {
    for (const url of ['/', '/chat', '/events', '/embedded', '/embed', '/api/health']) {
      expect(await ancestors(url)).toBe("frame-ancestors 'none'");
    }
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
