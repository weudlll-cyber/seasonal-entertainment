// ============================================================
// File:        bootstrap.test.js
// Path:        server/test/bootstrap.test.js
// Project:     Seasonal Entertainment
// Description: Guards POST /api/auth/bootstrap: header-only token, identical refusals that
//              differ only in the log (which never contains the token), one admin only.
// ============================================================

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapRoutes } from '../src/accounts/bootstrap.js';
import { makeTestApp } from './helpers/testApp.js';

const TOKEN = 'one-time-token-0123456789';
const admin = { username: 'boss', email: 'boss@example.org', password: 'correct-horse-1' };

let t;
afterEach(() => t?.close());

// The bootstrap router alone, with a captured log, on the test database.
function bootstrapOnly(config) {
  const lines = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { regenerate: (cb) => cb(), save: (cb) => cb() };
    next();
  });
  app.use(bootstrapRoutes(t.db, config, (line) => lines.push(line)));
  return { app, lines };
}

describe('bootstrap', () => {
  it('without a configured token: refused, logged as "not set"', async () => {
    t = makeTestApp({ bootstrapToken: null });
    const { app, lines } = bootstrapOnly(t.config);
    const res = await request(app).post('/bootstrap').set('x-bootstrap-token', TOKEN).send(admin);
    expect(res.status).toBe(403);
    expect(lines).toEqual(['[bootstrap] BOOTSTRAP_TOKEN not set; bootstrap disabled']);
  });

  it('a wrong token gets the SAME answer, a different log line, and no token in it', async () => {
    t = makeTestApp({ bootstrapToken: TOKEN });
    const { app, lines } = bootstrapOnly(t.config);
    const res = await request(app)
      .post('/bootstrap')
      .set('x-bootstrap-token', 'guess-guess-guess')
      .send(admin);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      error: 'bootstrap_unavailable',
      message: 'Bootstrap is not available.',
    });
    expect(lines).toEqual(['[bootstrap] bootstrap token mismatch; refused']);
    expect(lines.join()).not.toContain('guess');
  });

  it('a token in the body is ignored: only the header counts', async () => {
    t = makeTestApp({ bootstrapToken: TOKEN });
    const res = await t
      .client()
      .post('/api/auth/bootstrap')
      .send({ ...admin, token: TOKEN, bootstrapToken: TOKEN });
    expect(res.status).toBe(403);
  });

  it('creates the first admin once, logged in; a second attempt gets 409', async () => {
    t = makeTestApp({ bootstrapToken: TOKEN });
    const agent = t.client();
    const res = await agent.post('/api/auth/bootstrap').set('x-bootstrap-token', TOKEN).send(admin);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'boss', role: 'admin', canStartGames: true });
    expect((await agent.get('/api/auth/session')).body.user.role).toBe('admin');
    const again = await t
      .client()
      .post('/api/auth/bootstrap')
      .set('x-bootstrap-token', TOKEN)
      .send({ ...admin, username: 'boss2', email: 'b2@example.org' });
    expect(again.status).toBe(409);
  });
});
