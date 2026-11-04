// ============================================================
// File:        bingo.test.js
// Path:        server/test/bingo.test.js
// Project:     Seasonal Entertainment
// Description: Guards the site's side of Seasonal Bingo Royale (bingo/routes.js; docs/AUTH.md,
//              "Seasonal Bingo Royale"): GET /api/games/bingo/authorize answers 204 with exactly
//              the X-Acting-User-* headers for a member, organiser and admin in good standing (id,
//              name, role, email verified, may host, Discord steps as base64url JSON with public
//              icon addresses) and X-Acting-Guest alone for anyone else (signed out, locked,
//              required 2FA missing); a state-changing original method needs this site's Origin,
//              an unknown one is refused, other methods on the route itself 405; switched off,
//              404. The account-changes feed: each kind recorded by its own action and nothing
//              else, in order, paged by its cursor, only with the sync token. Account ids are
//              never issued twice, also after a restore of an older database. The games hub takes
//              the game at /games/bingo.
// ============================================================

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CHANGES_PAGE, noteAccountChange } from '../src/accounts/accountChanges.js';
import { setSetting } from '../src/settings/store.js';
import { proof } from './helpers/accountKeys.js';
import { seedTestSteps } from './helpers/steps.js';
import { ORIGIN, makeStaff, makeTestApp, registerUser, setRole } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const TOKEN = 'a-test-games-sync-token-of-32-characters-at-least';
const bingoApp = (bingo = {}) =>
  (t = makeTestApp({ bingo: { embedded: true, syncToken: TOKEN, ...bingo } }));

// The authorize answer as nginx's auth_request sends it: the browser's cookie (the agent's),
// the original method and, for a change, the browser's Origin.
const authorize = (agent, method = 'GET', origin) => {
  const req = agent.get('/api/games/bingo/authorize').set('X-Original-Method', method);
  return origin === undefined ? req.unset('Origin') : req.set('Origin', origin);
};
const actingHeaders = (res) =>
  Object.fromEntries(Object.entries(res.headers).filter(([name]) => name.startsWith('x-acting-')));
const stepsOf = (res) =>
  JSON.parse(Buffer.from(res.headers['x-acting-user-steps'], 'base64url').toString('utf8'));

describe('GET /api/games/bingo/authorize', () => {
  it('a member: exactly the user headers, no steps without Discord', async () => {
    bingoApp();
    const { agent, user } = await registerUser(t, 'mia');
    const res = await authorize(agent);
    expect(res.status).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(actingHeaders(res)).toEqual({
      'x-acting-user-id': String(user.id),
      'x-acting-user': 'mia',
      'x-acting-user-roles': 'member',
      'x-acting-user-email-verified': 'true',
      'x-acting-user-can-host': 'false',
      'x-acting-user-steps': Buffer.from('[]').toString('base64url'),
    });
  });

  it('organiser and admin carry their role; admins and "may start games" may host', async () => {
    bingoApp();
    const { agent: olga } = await makeStaff(t, 'olga', 'organiser');
    const { agent: ada } = await makeStaff(t, 'ada', 'admin');
    const { agent: mia, user } = await registerUser(t, 'mia');
    const organiser = await authorize(olga);
    expect([
      organiser.headers['x-acting-user-roles'],
      organiser.headers['x-acting-user-can-host'],
    ]).toEqual(['organiser', 'false']);
    const admin = await authorize(ada);
    expect([admin.headers['x-acting-user-roles'], admin.headers['x-acting-user-can-host']]).toEqual(
      ['admin', 'true']
    );
    t.db.prepare('UPDATE users SET can_start_games = 1 WHERE id = ?').run(user.id);
    expect((await authorize(mia)).headers['x-acting-user-can-host']).toBe('true');
  });

  it("a member's steps: the highest per ladder, with a public icon address", async () => {
    bingoApp();
    seedTestSteps(t.db);
    const { agent, user } = await registerUser(t, 'mia');
    const icon = 'step-icons/0123456789abcdef0123456789abcdef.webp';
    t.db
      .prepare("UPDATE discord_steps SET role_id = '11', icon_file = ? WHERE name = 'Golden'")
      .run(icon);
    t.db.prepare("UPDATE discord_steps SET role_id = '12' WHERE name = 'Bronze'").run();
    t.db.prepare("UPDATE discord_steps SET role_id = '13' WHERE name = 'Level 2'").run();
    t.db
      .prepare(
        `INSERT INTO discord_links (user_id, discord_id, discord_name, role_ids, linked_at, next_refresh_at)
         VALUES (?, '900', 'mia', '["11","12","13"]', '2026-11-04', '2099-01-01')`
      )
      .run(user.id);
    const steps = stepsOf(await authorize(agent));
    expect(steps).toEqual([
      { ladder: 'holder', name: 'Golden', icon: `/media/${icon}` },
      { ladder: 'investor', name: 'Level 2', icon: null },
    ]);
    // The icon is fetched by browsers without a login.
    mkdirSync(path.join(t.config.mediaDir, 'step-icons'), { recursive: true });
    writeFileSync(path.join(t.config.mediaDir, icon), 'webp bytes');
    expect((await t.client().get(`/media/${icon}`)).status).toBe(200);
  });

  it('anyone else gets X-Acting-Guest alone: signed out, locked, required 2FA missing', async () => {
    bingoApp();
    const guest = await authorize(t.client());
    expect(guest.status).toBe(204);
    expect(actingHeaders(guest)).toEqual({ 'x-acting-guest': 'true' });

    const { agent: locked, user } = await registerUser(t, 'lotte');
    t.db.prepare('UPDATE users SET locked = 1 WHERE id = ?').run(user.id);
    expect(actingHeaders(await authorize(locked))).toEqual({ 'x-acting-guest': 'true' });

    // Staff whose 2FA is not set up, and members while the site requires it of everyone.
    const { agent: staff, user: sam } = await registerUser(t, 'sam');
    setRole(t, sam.id, 'organiser');
    expect(actingHeaders(await authorize(staff))).toEqual({ 'x-acting-guest': 'true' });
    const { agent: member } = await registerUser(t, 'mia');
    setSetting(t.db, 'accounts.require2faAll', true);
    expect(actingHeaders(await authorize(member))).toEqual({ 'x-acting-guest': 'true' });
  });

  it("a change needs this site's Origin; an unknown or missing method is refused", async () => {
    bingoApp();
    const { agent } = await registerUser(t, 'mia');
    expect((await authorize(agent, 'POST', 'https://evil.example')).status).toBe(403);
    expect((await authorize(agent, 'POST')).status).toBe(403);
    expect((await authorize(agent, 'POST', ORIGIN)).status).toBe(204);
    expect((await authorize(agent, 'TRACE', ORIGIN)).status).toBe(403);
    expect((await agent.get('/api/games/bingo/authorize')).status).toBe(403); // no method
    expect((await authorize(agent, 'HEAD')).status).toBe(204);
  });

  it('other methods on the route itself: 405; switched off: 404', async () => {
    bingoApp();
    expect((await t.client().post('/api/games/bingo/authorize')).status).toBe(405);
    t.close();
    bingoApp({ embedded: false });
    expect((await authorize(t.client())).status).toBe(404);
    expect(
      (await t.client().get('/api/games/bingo/account-changes').set('X-Games-Sync-Token', TOKEN))
        .status
    ).toBe(404);
  });
});

describe('GET /api/games/bingo/account-changes', () => {
  const feed = (since, token = TOKEN) => {
    const req = t.client().get('/api/games/bingo/account-changes');
    if (since !== undefined) req.query({ since });
    return token === null ? req : req.set('X-Games-Sync-Token', token);
  };

  it('each kind by its own action, and nothing else', async () => {
    bingoApp();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const { agent: mia, user } = await registerUser(t, 'mia');
    const kinds = async () => (await feed()).body.changes;
    const base = (await kinds()).length; // the staff setup's own changes
    const after = async () => (await kinds()).slice(base);

    // Nothing that is not one of the four: a login, a profile change, a setting.
    await mia.put('/api/auth/notifications').send({ notifyMentions: true });
    expect(await after()).toEqual([]);
    const id = user.id;
    await admin.post(`/api/admin/users/${id}/lock`).send({ locked: true });
    await admin.post(`/api/admin/users/${id}/lock`).send({ locked: false });
    await admin.post(`/api/admin/users/${id}/role`).send({ role: 'organiser' });
    await admin.post(`/api/admin/users/${id}/role`).send({ role: 'organiser' }); // no change
    await admin.post(`/api/admin/users/${id}/can-start-games`).send({ value: true });
    await mia.delete('/api/auth/account').send(await proof('correct-horse-1'));
    expect(await after()).toEqual([
      { id, kind: 'locked' },
      { id, kind: 'unlocked' },
      { id, kind: 'rights' },
      { id, kind: 'rights' },
      { id, kind: 'deleted' },
    ]);
  });

  it('pages by its cursor, at most 500 an answer', async () => {
    bingoApp();
    const start = (await feed()).body.next;
    for (let id = 1; id <= CHANGES_PAGE + 3; id += 1) noteAccountChange(t.db, 1000 + id, 'deleted');
    const first = (await feed(start)).body;
    expect(first.changes).toHaveLength(CHANGES_PAGE);
    expect(first.changes[0]).toEqual({ id: 1001, kind: 'deleted' });
    const second = (await feed(first.next)).body;
    expect(second.changes.map((c) => c.id)).toEqual([1501, 1502, 1503]);
    expect((await feed(second.next)).body).toEqual({ changes: [], next: second.next });
    expect((await feed('nope')).status).toBe(400);
  });

  it('only with the sync token', async () => {
    bingoApp();
    expect((await feed(undefined, null)).status).toBe(401);
    expect((await feed(undefined, 'wrong-token-wrong-token-wrong-token')).status).toBe(401);
    expect((await feed()).status).toBe(200);
    t.close();
    bingoApp({ syncToken: null }); // no token set up: nobody gets in
    expect((await feed()).status).toBe(401);
  });
});

describe('the games hub', () => {
  it('takes the game at /games/bingo, and lists its card with that path', async () => {
    bingoApp();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const created = await admin.post('/api/admin/games').send({
      name: 'Seasonal Bingo Royale',
      image: 'winter',
      status: 'available',
      path: '/games/bingo',
      visibility: 'everyone',
    });
    expect(created.status).toBe(201);
    const listed = (await t.client().get('/api/games')).body.games;
    expect(listed.find((g) => g.name === 'Seasonal Bingo Royale')).toMatchObject({
      path: '/games/bingo',
      status: 'available',
    });
  });
});

describe('account ids', () => {
  it('are never issued twice: not after deleting the newest, nor after a restore', async () => {
    bingoApp();
    const { agent: anna, user: first } = await registerUser(t, 'anna');
    await anna.delete('/api/auth/account').send(await proof('correct-horse-1'));
    const { user: second } = await registerUser(t, 'bert');
    expect(second.id).toBeGreaterThan(first.id);
    // A restored older database knows nothing of the ids issued since: the file beside it does.
    t.db.prepare('DELETE FROM account_ids').run();
    t.db.prepare('DELETE FROM users WHERE id = ?').run(second.id);
    const { user: third } = await registerUser(t, 'carl');
    expect(third.id).toBeGreaterThan(second.id);
    rmSync(`${t.db.name}.issued-account-ids`);
  });
});
