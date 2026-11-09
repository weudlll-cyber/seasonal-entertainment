// ============================================================
// File:        embeddedFeed.test.js
// Path:        server/test/embeddedFeed.test.js
// Project:     Seasonal Entertainment
// Description: Guards the account-changes feed of the embedded games (games/embeddedRoutes.js,
//              accounts/accountChanges.js; docs/AUTH.md, "Embedded games"), for Bingo and Mini
//              Games alike: each kind recorded by its own action and nothing else, in order, paged
//              by its cursor, only with the one sync token; one feed, each game with its own
//              cursor. Account ids are never issued twice, also after a restore of an older
//              database. The games hub takes the game at /games/bingo.
// ============================================================

import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CHANGES_PAGE, noteAccountChange } from '../src/accounts/accountChanges.js';
import { proof } from './helpers/accountKeys.js';
import { GAMES, TOKEN, gamesApp } from './helpers/embeddedGames.js';
import { makeStaff, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const withGames = (games) => (t = gamesApp(games));

describe.each(GAMES)('GET /api/games/%s/account-changes', (slug) => {
  const feed = (since, token = TOKEN) => {
    const req = t.client().get(`/api/games/${slug}/account-changes`);
    if (since !== undefined) req.query({ since });
    return token === null ? req : req.set('X-Games-Sync-Token', token);
  };

  it('each kind by its own action, and nothing else', async () => {
    withGames();
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
    await admin.post(`/api/admin/users/${id}/game-host`).send({ game: 'mini-games', value: true });
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
    withGames();
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
    withGames();
    expect((await feed(undefined, null)).status).toBe(401);
    expect((await feed(undefined, 'wrong-token-wrong-token-wrong-token')).status).toBe(401);
    expect((await feed()).status).toBe(200);
    t.close();
    withGames({ syncToken: null }); // no token set up: nobody gets in
    expect((await feed()).status).toBe(401);
  });
});

describe('one feed for all games', () => {
  it('each game reads the same changes from its own cursor', async () => {
    withGames();
    const read = (game, since) =>
      t
        .client()
        .get(`/api/games/${game}/account-changes`)
        .query({ since })
        .set('X-Games-Sync-Token', TOKEN);
    const start = (await read('bingo', 0)).body.next;
    noteAccountChange(t.db, 2001, 'locked');
    const bingo = (await read('bingo', start)).body;
    noteAccountChange(t.db, 2002, 'deleted');
    // Bingo is past the first change, Mini Games still before it: neither moves the other.
    expect((await read('bingo', bingo.next)).body.changes).toEqual([{ id: 2002, kind: 'deleted' }]);
    expect((await read('mini-games', start)).body.changes).toEqual([
      { id: 2001, kind: 'locked' },
      { id: 2002, kind: 'deleted' },
    ]);
  });
});

describe('the games hub', () => {
  it('takes the game at /games/bingo, and lists its card with that path', async () => {
    withGames();
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
    withGames();
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
