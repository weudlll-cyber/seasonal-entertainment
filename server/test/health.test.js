// ============================================================
// File:        health.test.js
// Path:        server/test/health.test.js
// Project:     Seasonal Entertainment
// Description: Guards GET /api/health: status, JSON shape and the build identity it reports,
//              and the JSON 404 for unknown API paths.
// ============================================================

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers/testApp.js';

let t;
beforeEach(() => (t = makeTestApp()));
afterEach(() => t.close());

describe('GET /api/health', () => {
  it('answers ok with version and commit', async () => {
    const res = await t.client().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true, version: '9.9.9', commit: 'abc123def456' });
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await t.client().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: 'not_found' });
  });
});
