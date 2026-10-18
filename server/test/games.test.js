// ============================================================
// File:        games.test.js
// Path:        server/test/games.test.js
// Project:     Seasonal Entertainment
// Description: Guards the games hub: visibility per viewer (guest, member, organiser),
//              status passed through, the editor for admins only and audited, input rules,
//              and the first-start "Seasonal Race" entry.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { seedGames } from '../src/games/seed.js';
import { makeStaff, makeTestApp, registerUser } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

const game = (name, visibility, status = 'available') => ({
  name,
  description: `${name} game`,
  image: 'spring',
  status,
  path: `/games/${name.toLowerCase()}`,
  visibility,
});

const names = async (agent) => (await agent.get('/api/games')).body.games.map((g) => g.name);

describe('visibility and status', () => {
  it('guests see "everyone", members also "members", organisers everything', async () => {
    t = makeTestApp();
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    await admin.post('/api/admin/games').send(game('Open', 'everyone', 'coming_soon'));
    await admin.post('/api/admin/games').send(game('Club', 'members'));
    await admin.post('/api/admin/games').send(game('Staff', 'organisers', 'maintenance'));
    const { agent: member } = await registerUser(t, 'mia');
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');

    expect(await names(t.client())).toEqual(['Open']);
    expect(await names(member)).toEqual(['Open', 'Club']);
    expect(await names(organiser)).toEqual(['Open', 'Club', 'Staff']);
    const statuses = (await organiser.get('/api/games')).body.games.map((g) => g.status);
    expect(statuses).toEqual(['coming_soon', 'available', 'maintenance']);
  });
});

describe('editor', () => {
  it('is for admins only', async () => {
    t = makeTestApp();
    const { agent: organiser } = await makeStaff(t, 'olga', 'organiser');
    expect((await organiser.post('/api/admin/games').send(game('X', 'everyone'))).status).toBe(403);
    expect((await t.client().get('/api/admin/games')).status).toBe(401);
  });

  it('audits create, edit (with what changed) and delete', async () => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    const created = (await agent.post('/api/admin/games').send(game('Quiz', 'everyone'))).body.game;
    await agent
      .put(`/api/admin/games/${created.id}`)
      .send({ ...game('Quiz', 'everyone'), status: 'maintenance' });
    await agent.delete(`/api/admin/games/${created.id}`);
    const rows = t.db.prepare('SELECT action, before, after FROM audit_log ORDER BY id').all();
    expect(rows.map((r) => r.action)).toEqual(['game.create', 'game.edit', 'game.delete']);
    expect(JSON.parse(rows[1].before)).toEqual({ status: 'available' });
    expect(JSON.parse(rows[1].after)).toEqual({ status: 'maintenance' });
  });

  it.each([
    ['an outside image', { image: 'https://evil.example/x.png' }],
    ['a path outside /games/', { path: '/admin' }],
    ['an unknown status', { status: 'live' }],
    ['an unknown visibility', { visibility: 'friends' }],
  ])('refuses %s', async (_label, bad) => {
    t = makeTestApp();
    const { agent } = await makeStaff(t, 'ada', 'admin');
    expect(
      (await agent.post('/api/admin/games').send({ ...game('X', 'everyone'), ...bad })).status
    ).toBe(400);
  });
});

describe('first start', () => {
  it('adds "Seasonal Race", coming soon, for everyone, once', async () => {
    t = makeTestApp();
    expect(seedGames(t.db)).toBe(1);
    expect(seedGames(t.db)).toBe(0);
    expect((await t.client().get('/api/games')).body.games).toEqual([
      expect.objectContaining({
        name: 'Seasonal Race',
        status: 'coming_soon',
        path: '/games/race',
        visibility: 'everyone',
        image: 'seasonal-tokens',
      }),
    ]);
  });
});
