// ============================================================
// File:        health.test.js
// Path:        server/test/health.test.js
// Project:     Seasonal Entertainment
// Description: Guards GET /api/health: status, JSON shape and the build identity it reports.
// ============================================================

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const buildInfo = { version: '9.9.9', commit: 'abc123def456' };

describe('GET /api/health', () => {
  it('answers ok with version and commit', async () => {
    const res = await request(createApp({ buildInfo })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ ok: true, version: '9.9.9', commit: 'abc123def456' });
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const res = await request(createApp({ buildInfo })).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'not_found' });
  });
});
