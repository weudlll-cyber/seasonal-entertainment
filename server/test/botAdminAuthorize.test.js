// ============================================================
// File:        botAdminAuthorize.test.js
// Path:        server/test/botAdminAuthorize.test.js
// Project:     Seasonal Entertainment
// Description: GET /api/bot-admin/authorize (bots/adminAuthorizeRoutes.js), as the host's nginx
//              asks it before every request to the event bot's admin page: 204 with
//              X-Acting-User for organisers and admins with 2FA; 401 for a guest and a locked
//              account (its session ends); 403 for a member and staff without 2FA; 404 while
//              BOT_ADMIN_EMBEDDED is off. A state change needs the site's Origin and writes one
//              audit entry (method and path, no query, no body); a read writes none. Every answer
//              is no-store and repeats nothing the request sent. The session answer says whether
//              the page is set up (features.botAdmin).
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { auditActions } from './helpers/chat.js';
import { makeStaff, makeTestApp, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t.close());

const TOKEN = 'bot-token-the-site-must-never-repeat';

// nginx's subrequest: the browser's headers plus the original method and URI.
const authorize = (agent, method = 'GET', uri = '/bot-admin/') =>
  agent
    .get('/api/bot-admin/authorize')
    .set('X-Original-Method', method)
    .set('X-Original-URI', uri)
    .set('X-Bot-Admin-Token', TOKEN);

const auditRows = () =>
  t.db
    .prepare('SELECT actor_name, action, target_type, target_id, before, after FROM audit_log')
    .all();

// Every answer: never cached, and nothing of the request in it (no header, no value).
function expectClean(res) {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['x-bot-admin-token']).toBeUndefined();
  const all = JSON.stringify(res.headers) + res.text;
  expect(all).not.toContain(TOKEN);
  expect(all).not.toContain('X-Original');
}

describe('who is let through', () => {
  it('an organiser with 2FA: 204 and X-Acting-User', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'olga', 'organiser');
    const res = await authorize(agent);
    expect(res.status).toBe(204);
    expect(res.headers['x-acting-user']).toBe('olga');
    expectClean(res);
  });

  it('an admin with 2FA: 204', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const res = await authorize(agent);
    expect(res.status).toBe(204);
    expect(res.headers['x-acting-user']).toBe('ada');
    expectClean(res);
  });

  it('a guest: 401', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const res = await authorize(t.client());
    expect(res.status).toBe(401);
    expect(res.headers['x-acting-user']).toBeUndefined();
    expectClean(res);
  });

  it('a member: 403', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await registerUser(t, 'mia');
    const res = await authorize(agent);
    expect(res.status).toBe(403);
    expect(res.headers['x-acting-user']).toBeUndefined();
    expectClean(res);
  });

  it('an organiser without 2FA: 403 two_factor_required', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent, user } = await registerUser(t, 'otto');
    setRole(t, user.id, 'organiser');
    const res = await authorize(agent);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('two_factor_required');
    expectClean(res);
  });

  it('a locked organiser: refused like everywhere (the session ends: 401)', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent, user } = await makeStaff(t, 'olga', 'organiser');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(user.id);
    const res = await authorize(agent);
    expect(res.status).toBe(401);
    expect(res.headers['x-acting-user']).toBeUndefined();
    expectClean(res);
  });

  it('BOT_ADMIN_EMBEDDED off: 404 even for an admin', async () => {
    t = makeTestApp();
    expect(t.config.botAdminEmbedded).toBe(false);
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const res = await authorize(agent);
    expect(res.status).toBe(404);
    expect(res.headers['x-acting-user']).toBeUndefined();
    expectClean(res);
    expect((await authorize(t.client())).status).toBe(404);
  });

  it('without nginx X-Original-Method: refused (fail closed)', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'olga', 'organiser');
    const res = await agent.get('/api/bot-admin/authorize').set('X-Original-URI', '/bot-admin/');
    expect(res.status).toBe(403);
    expectClean(res);
    expect(auditRows()).toEqual([]);
  });
});

describe('changes: the Origin rule and the audit log', () => {
  it('a same-origin POST: 204 and exactly one audit entry with method and path', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'olga', 'organiser');
    const res = await authorize(agent, 'POST', '/bot-admin/api/events/7?secret=abc#x')
      .set('Content-Type', 'application/json')
      .send({ title: 'body-must-not-be-kept' });
    expect(res.status).toBe(204);
    expect(res.headers['x-acting-user']).toBe('olga');
    expectClean(res);
    const rows = auditRows();
    expect(rows).toEqual([
      {
        actor_name: 'olga',
        action: 'bot_admin.change',
        target_type: 'bot_admin',
        target_id: '/bot-admin/api/events/7',
        before: null,
        after: JSON.stringify({ method: 'POST' }),
      },
    ]);
    const stored = JSON.stringify(rows);
    for (const leak of ['secret', 'abc', 'body-must-not-be-kept', TOKEN]) {
      expect(stored).not.toContain(leak);
    }
  });

  it('PUT, PATCH and DELETE are changes too; GET, HEAD and OPTIONS write nothing', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'ada', 'admin');
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect((await authorize(agent, method, '/bot-admin/api/events')).status).toBe(204);
    }
    expect(auditActions(t)).toEqual([]);
    for (const method of ['PUT', 'patch', 'DELETE']) {
      expect((await authorize(agent, method, '/bot-admin/api/events/1')).status).toBe(204);
    }
    expect(auditRows().map((row) => JSON.parse(row.after).method)).toEqual([
      'PUT',
      'PATCH',
      'DELETE',
    ]);
  });

  it('a cross-origin change: 403 cross_origin, no audit entry', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'olga', 'organiser');
    const res = await authorize(agent, 'POST', '/bot-admin/api/events').set(
      'Origin',
      'https://evil.example'
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_origin');
    expect(res.headers['x-acting-user']).toBeUndefined();
    expectClean(res);
    expect(auditRows()).toEqual([]);
  });

  it('a change without Origin or Referer: 403 origin_required (CSRF_STRICT)', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'olga', 'organiser');
    const res = await authorize(agent, 'DELETE', '/bot-admin/api/events/3').unset('Origin');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('origin_required');
    expect(auditRows()).toEqual([]);
  });

  it('a cross-origin read is let through: nothing changes, nothing is written', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    const { agent } = await makeStaff(t, 'olga', 'organiser');
    const res = await authorize(agent, 'GET').set('Origin', 'https://evil.example');
    expect(res.status).toBe(204);
    expect(auditRows()).toEqual([]);
  });
});

describe('the session answer', () => {
  it('says whether the bot admin page is set up', async () => {
    t = makeTestApp({ botAdminEmbedded: true });
    expect((await t.client().get('/api/auth/session')).body.features.botAdmin).toBe(true);
    t.close();
    t = makeTestApp();
    expect((await t.client().get('/api/auth/session')).body.features.botAdmin).toBe(false);
  });
});
