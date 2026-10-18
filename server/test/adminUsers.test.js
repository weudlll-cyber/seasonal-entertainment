// ============================================================
// File:        adminUsers.test.js
// Path:        server/test/adminUsers.test.js
// Project:     Seasonal Entertainment
// Description: Guards /api/admin: only admins (with 2FA) get in, the last admin cannot be
//              demoted or locked, every action writes exactly one audit entry, a password
//              reset ends the user's sessions, and search finds users.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { logIn, newPasswordBody } from './helpers/accountKeys.js';
import { makeStaff, makeTestApp, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const auditCount = () => t.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
const lastAudit = () => t.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get();

describe('access', () => {
  const ADMIN_CALLS = [
    ['get', '/api/admin/users'],
    ['get', '/api/admin/audit'],
    ['post', '/api/admin/users/1/role'],
    ['post', '/api/admin/users/1/lock'],
    ['post', '/api/admin/users/1/can-start-games'],
    ['post', '/api/admin/users/1/password'],
  ];

  it('refuses guests (401), members and organisers (403)', async () => {
    t = makeTestApp();
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    for (const [method, url] of ADMIN_CALLS) {
      expect((await t.client()[method](url).send({})).status, url).toBe(401);
      expect((await member[method](url).send({})).status, url).toBe(403);
      expect((await organiser[method](url).send({})).status, url).toBe(403);
    }
  });

  it('refuses an admin without 2FA until it is set up', async () => {
    t = makeTestApp();
    const { agent, user } = await registerUser(t, 'ada');
    setRole(t, user.id, 'admin');
    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('two_factor_required');
  });
});

describe('user changes', () => {
  it('lists and searches users', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    await registerUser(t, 'bert');
    await registerUser(t, 'carla');
    const all = await agent.get('/api/admin/users');
    expect(all.body.users.map((u) => u.username)).toEqual(['ada', 'bert', 'carla']);
    const found = await agent.get('/api/admin/users?q=CAR');
    expect(found.body.users.map((u) => u.username)).toEqual(['carla']);
    expect(found.body.users[0]).not.toHaveProperty('passwordHash');
  });

  it('changes role, can-start-games and lock, one audit entry each with before/after', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const { user: bert } = await registerUser(t, 'bert');
    const base = `/api/admin/users/${bert.id}`;

    expect((await agent.post(`${base}/role`).send({ role: 'organiser' })).status).toBe(200);
    expect(auditCount()).toBe(1);
    expect(lastAudit()).toMatchObject({
      actor_name: 'ada',
      action: 'user.role',
      target_type: 'user',
      target_id: String(bert.id),
      before: '{"role":"member"}',
      after: '{"role":"organiser"}',
    });

    expect((await agent.post(`${base}/can-start-games`).send({ value: true })).status).toBe(200);
    expect(auditCount()).toBe(2);
    expect(lastAudit().action).toBe('user.can_start_games');

    expect((await agent.post(`${base}/lock`).send({ locked: true })).status).toBe(200);
    expect(auditCount()).toBe(3);
    expect(lastAudit().action).toBe('user.lock');

    const list = (await agent.get('/api/admin/users?q=bert')).body.users[0];
    expect(list).toMatchObject({ role: 'organiser', canStartGames: true, locked: true });
  });

  it('refuses bad input without an audit entry', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const { user: bert } = await registerUser(t, 'bert');
    const res = await agent.post(`/api/admin/users/${bert.id}/role`).send({ role: 'king' });
    expect(res.status).toBe(400);
    expect((await agent.post('/api/admin/users/999/role').send({ role: 'member' })).status).toBe(
      404
    );
    expect(auditCount()).toBe(0);
  });

  it('a password reset ends all sessions of that user, and is audited without the password', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const { agent: bertSession, user: bert } = await registerUser(t, 'bert');
    const reset = await newPasswordBody('brand-new-pass-1');
    const res = await agent.post(`/api/admin/users/${bert.id}/password`).send(reset);
    expect(res.status).toBe(200);
    expect((await bertSession.get('/api/auth/session')).body.user).toBeNull();
    expect(lastAudit().action).toBe('user.password_reset');
    expect(JSON.stringify(lastAudit())).not.toContain('brand-new-pass-1');
    // The browser now derives with the reset's salt, and the new auth key logs in.
    const pre = await t.client().post('/api/auth/prelogin').send({ username: 'bert' });
    expect(pre.body.salt).toBe(reset.salt);
    const relogin = await t
      .client()
      .post('/api/auth/login')
      .send({ username: 'bert', authKey: reset.authKey });
    expect(relogin.status).toBe(200);
    expect((await logIn(t.client(), 'bert', 'correct-horse-1')).status).toBe(401);
  });
});

describe('last admin', () => {
  it('cannot be demoted or locked; with a second admin it can', async () => {
    t = makeTestApp();
    const { agent, user: ada } = await makeStaff(t, 'ada', 'admin');
    const demote = await agent.post(`/api/admin/users/${ada.id}/role`).send({ role: 'member' });
    expect(demote.status).toBe(409);
    expect(demote.body.error).toBe('last_admin');

    const { agent: bea, user: beaUser } = await makeStaff(t, 'bea', 'admin');
    expect(
      (await bea.post(`/api/admin/users/${beaUser.id}/lock`).send({ locked: true })).status
    ).toBe(409); // own account
    expect((await bea.post(`/api/admin/users/${ada.id}/lock`).send({ locked: true })).status).toBe(
      200
    );
    // Now bea is the only active admin: demoting her is refused.
    const last = await bea.post(`/api/admin/users/${beaUser.id}/role`).send({ role: 'member' });
    expect(last.status).toBe(409);
    expect(auditCount()).toBe(1);
  });
});

describe('audit page', () => {
  it('lists entries newest first', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const { user: bert } = await registerUser(t, 'bert');
    await agent.post(`/api/admin/users/${bert.id}/role`).send({ role: 'organiser' });
    await agent.post(`/api/admin/users/${bert.id}/role`).send({ role: 'member' });
    const { entries } = (await agent.get('/api/admin/audit')).body;
    expect(entries.map((e) => e.after.role)).toEqual(['member', 'organiser']);
    expect(entries[0]).toMatchObject({ actor: 'ada', action: 'user.role', targetType: 'user' });
  });
});
