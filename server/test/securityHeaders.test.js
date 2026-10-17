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
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const buildInfo = { version: '0.0.0', commit: 'test' };
const clientDist = mkdtempSync(path.join(tmpdir(), 'se-dist-'));
writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>shell</title>');
afterAll(() => rmSync(clientDist, { recursive: true, force: true }));

describe('security headers', () => {
  it('sends a strict Content-Security-Policy and the usual hardening headers', async () => {
    const res = await request(createApp({ buildInfo })).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends them on page responses too', async () => {
    const res = await request(createApp({ buildInfo, clientDist })).get('/events');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });
});

describe('client-route fallback', () => {
  it('serves index.html for a client route', async () => {
    const res = await request(createApp({ buildInfo, clientDist })).get('/info/faq');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>shell</title>');
  });

  it('never serves the page for an unknown API path', async () => {
    const res = await request(createApp({ buildInfo, clientDist })).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'not_found' });
  });
});
