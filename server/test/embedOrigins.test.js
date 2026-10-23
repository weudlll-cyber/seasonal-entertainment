// ============================================================
// File:        embedOrigins.test.js
// Path:        server/test/embedOrigins.test.js
// Project:     Seasonal Entertainment
// Description: The admin list of sites allowed to embed the chat (embed/origins.js,
//              /api/admin/embed-origins): admins only; exact https origins, normalised, no
//              wildcards, paths or this site itself; every change audited. The CSP of /embed/*
//              lists exactly 'self' and the approved sites, follows a change on the very next
//              request, and every other page stays unframeable. The public check answers per
//              origin without revealing the list.
// ============================================================

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normaliseOrigin } from '../src/embed/origins.js';
import { SITE, approveSite, removeSite } from './helpers/embed.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

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

const ancestors = async (url) =>
  (await t.client().get(url)).headers['content-security-policy']
    .split(';')
    .find((d) => d.trim().startsWith('frame-ancestors'))
    .trim();
const auditOf = () =>
  t.db
    .prepare("SELECT action, target_id AS origin FROM audit_log WHERE target_type = 'embed_origin'")
    .all();

describe('the list', () => {
  it('admins only', async () => {
    const member = (await registerUser(t, 'mia')).agent;
    expect((await member.get('/api/admin/embed-origins')).status).toBe(403);
    expect((await member.post('/api/admin/embed-origins').send({ origin: SITE })).status).toBe(403);
    expect((await t.client().get('/api/admin/embed-origins')).status).toBe(401);
  });

  it('takes exact https origins, normalised, and audits every change', async () => {
    const admin = await approveSite(t, 'HTTPS://Game.Example:443');
    await approveSite(t, 'https://other.example/'); // a trailing slash is still the origin
    expect((await admin.get('/api/admin/embed-origins')).body.origins).toEqual([
      SITE,
      'https://other.example',
    ]);
    expect((await removeSite(t, 'https://other.example')).body.origins).toEqual([SITE]);
    expect(auditOf()).toEqual([
      { action: 'embed.origin_add', origin: SITE },
      { action: 'embed.origin_add', origin: 'https://other.example' },
      { action: 'embed.origin_remove', origin: 'https://other.example' },
    ]);
  });

  it.each([
    ['a wildcard', 'https://*.example.org', /Wildcards/],
    ['plain http', 'http://game.example', /https/],
    ['a path', 'https://game.example/play', /no path/],
    ['a query', 'https://game.example?x=1', /no path/],
    ['a login part', 'https://user@game.example', /login part/],
    ['no address', 'game', /site address/],
  ])('refuses %s', async (_name, origin, message) => {
    const admin = await approveSite(t);
    const res = await admin.post('/api/admin/embed-origins').send({ origin });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  it('refuses this site itself', async () => {
    // A site on https (this one's tests run on http, which the list refuses anyway).
    const own = makeTestApp({ clientDist, publicOrigin: 'https://se.example' });
    own.client = () => request.agent(own.app).set('Origin', 'https://se.example');
    try {
      const admin = await approveSite(own, SITE);
      const res = await admin
        .post('/api/admin/embed-origins')
        .send({ origin: 'https://se.example' });
      expect(res.body.message).toMatch(/its own chat already/);
    } finally {
      own.close();
    }
  });
});

describe('trying it on one machine', () => {
  it('development approves http on localhost, 127.0.0.1 and [::1] only; production never', async () => {
    const admin = await approveSite(t, 'http://[::1]:5380');
    await approveSite(t, 'http://localhost:5380');
    const res = await admin
      .post('/api/admin/embed-origins')
      .send({ origin: 'http://game.example' });
    expect(res.status).toBe(400);
    expect((await admin.get('/api/admin/embed-origins')).body.origins).toEqual([
      'http://[::1]:5380',
      'http://localhost:5380',
    ]);
    expect(normaliseOrigin('http://localhost:5380')).toEqual({
      error: 'Only https:// sites can be approved.',
    });
  });
});

describe('framing', () => {
  it("/embed/* lists 'self' and exactly the approved sites, and follows each change", async () => {
    expect(await ancestors('/embed/chat')).toBe("frame-ancestors 'self'");
    await approveSite(t);
    await approveSite(t, 'https://other.example');
    expect(await ancestors('/embed/chat?room=general')).toBe(
      `frame-ancestors 'self' ${SITE} https://other.example`
    );
    await removeSite(t, 'https://other.example');
    expect(await ancestors('/embed/chat')).toBe(`frame-ancestors 'self' ${SITE}`);
    // Every other page keeps refusing every frame.
    for (const url of ['/', '/chat', '/embedded', '/api/health']) {
      expect(await ancestors(url)).toBe("frame-ancestors 'none'");
    }
  });

  it('the login popup stays reachable from its opener, and cannot be framed', async () => {
    await approveSite(t);
    const popup = await t.client().get(`/embed-login?origin=${encodeURIComponent(SITE)}`);
    expect(popup.headers['cross-origin-opener-policy']).toBeUndefined();
    expect(await ancestors('/embed-login')).toBe("frame-ancestors 'none'");
    // Everywhere else the site keeps its opener isolation.
    for (const url of ['/', '/login', '/embed/chat']) {
      expect((await t.client().get(url)).headers['cross-origin-opener-policy']).toBe('same-origin');
    }
  });

  it('the public check answers per site without listing them', async () => {
    await approveSite(t);
    const check = async (origin) =>
      (await t.client().get(`/api/embed/check?origin=${encodeURIComponent(origin)}`)).body;
    // An approved site also hears what guests may do there (embedGuests.test.js).
    const approved = {
      ok: true,
      allowed: true,
      guestsRead: true,
      guestsWrite: false,
      uploads: false,
      images: false,
    };
    expect(await check(SITE)).toEqual(approved);
    expect(await check('https://GAME.example')).toEqual(approved);
    expect(await check('https://evil.example')).toEqual({ ok: true, allowed: false });
    expect(await check('not a site')).toEqual({ ok: true, allowed: false });
  });
});
