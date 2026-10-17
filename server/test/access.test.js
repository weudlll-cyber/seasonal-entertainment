// ============================================================
// File:        access.test.js
// Path:        server/test/access.test.js
// Project:     Seasonal Entertainment
// Description: Guards deny-by-default authorisation: every route of the real app declares
//              who may call it, the checker catches a route that does not, and allow() refuses
//              guests and too-low roles.
// ============================================================

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { allow, findUndeclaredRoutes } from '../src/http/access.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

describe('route declarations', () => {
  it('every route of the real app declares its access level', () => {
    t = makeTestApp();
    expect(findUndeclaredRoutes(t.app)).toEqual([]);
  });

  it('a route added without a declaration is reported', () => {
    t = makeTestApp();
    const extra = express.Router();
    extra.post('/sneaky', (_req, res) => res.json({}));
    t.app.use('/api/extra', extra);
    expect(findUndeclaredRoutes(t.app)).toEqual(['POST /sneaky']);
  });

  it('refuses an unknown access level at definition time', () => {
    expect(() => allow('everyone')).toThrow(/unknown access level/);
  });
});

describe('allow()', () => {
  const appAs = (user) => {
    const app = express();
    app.use((req, _res, next) => ((req.user = user), next()));
    app.get('/member', allow('member'), (_req, res) => res.json({ ok: true }));
    app.get('/admin', allow('admin'), (_req, res) => res.json({ ok: true }));
    return app;
  };

  it('answers 401 to a guest on a member route', async () => {
    expect((await request(appAs(null)).get('/member')).status).toBe(401);
  });

  it('answers 403 to a member on an admin route, 200 to an admin', async () => {
    expect((await request(appAs({ role: 'member' })).get('/admin')).status).toBe(403);
    expect((await request(appAs({ role: 'admin' })).get('/admin')).status).toBe(200);
  });
});
