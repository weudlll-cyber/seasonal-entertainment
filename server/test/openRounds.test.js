// ============================================================
// File:        openRounds.test.js
// Path:        server/test/openRounds.test.js
// Project:     Seasonal Entertainment
// Description: Guards games' open sign-ups (games/openRounds.js, games/openRoundsContract.js;
//              docs/OPEN-ROUNDS.md) against a pretend internet (helpers/previewNet.js): a valid
//              answer gives the rounds, soonest first, unknown fields dropped; invalid rounds and
//              a joinUrl off the status URL's origin are dropped, never the page; a higher
//              version means none; an answer over 64 KB, one that takes longer than 5 s, a page
//              that is not the contract and a redirect all fail, and the last good answer then
//              counts until it is 3 minutes old; a failing game is logged once per change,
//              never with the body. Through the API: GET /api/games carries each game's open
//              rounds to everyone and never the status URL; Admin → Games takes an https status
//              URL only, audits it, and reads it at once.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { STALE_MS, createOpenRounds } from '../src/games/openRounds.js';
import { auditActions } from './helpers/chat.js';
import { PUBLIC_IP, previewInternet, redirect } from './helpers/previewNet.js';
import { makeStaff, makeTestApp } from './helpers/testApp.js';

let t;
let internet;
afterEach(async () => {
  t?.close();
  await internet?.close();
  internet = null;
});

const STATUS = 'https://bingo.test/api/open-rounds';
const ROUND = {
  id: 'r1',
  title: 'Friday Royale',
  kind: 'Seasonal Bingo Royale',
  startsAt: '2099-11-06T19:00:00Z',
  signupClosesAt: '2099-11-06T18:55:00Z',
  players: 12,
  maxPlayers: 50,
  joinUrl: 'https://bingo.test/rounds/r1',
};
const json = (body) => (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

// The pretend game answering `handler` at STATUS; a game row pointing there.
async function setup(handler) {
  internet = await previewInternet(
    { 'bingo.test/api/open-rounds': (req, res) => current(req, res) },
    { 'bingo.test': [PUBLIC_IP] }
  );
  let current = handler;
  t = makeTestApp();
  const { lastInsertRowid } = t.db
    .prepare(
      `INSERT INTO games (name, image, status, path, visibility, status_url)
       VALUES ('Bingo', 'winter', 'available', '/games/bingo', 'everyone', ?)`
    )
    .run(STATUS);
  const logged = [];
  const rounds = createOpenRounds(t.db, {
    network: internet.network,
    log: (line) => logged.push(line),
  });
  return {
    rounds,
    gameId: Number(lastInsertRowid),
    logged,
    answer: (next) => {
      current = next;
    },
  };
}

describe('the poller', () => {
  it('a valid answer: the rounds, soonest first, nothing beyond the contract', async () => {
    const later = { ...ROUND, id: 'r2', title: 'Later', startsAt: '2099-11-07T19:00:00Z' };
    const unplanned = { ...ROUND, id: 'r3', title: 'Any time', startsAt: null };
    const { rounds, gameId } = await setup(
      json({ version: 1, rounds: [unplanned, later, { ...ROUND, secret: 'x', players: 3 }] })
    );
    await rounds.pollAll();
    expect(rounds.roundsFor(gameId).map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(rounds.roundsFor(gameId)[0]).toEqual({ ...ROUND, players: 3 });
  });

  it('invalid rounds and a foreign joinUrl are dropped, never the page; at most 20', async () => {
    const bad = [
      { ...ROUND, id: '' },
      { ...ROUND, id: 'x'.repeat(65) },
      { ...ROUND, title: 'x'.repeat(81) },
      { ...ROUND, kind: 'x'.repeat(41) },
      { ...ROUND, startsAt: '2099-11-06 19:00' },
      { ...ROUND, startsAt: '2099-11-06T19:00:00+01:00' },
      { ...ROUND, players: -1 },
      { ...ROUND, players: 1.5 },
      { ...ROUND, maxPlayers: 0 },
      { ...ROUND, joinUrl: 'https://evil.test/rounds/r1' },
      { ...ROUND, joinUrl: 'http://bingo.test/rounds/r1' },
      { ...ROUND, joinUrl: 'not a url' },
      { ...ROUND, signupClosesAt: '2000-01-01T00:00:00Z' }, // closed by now
      'not an object',
    ];
    const good = Array.from({ length: 25 }, (_, i) => ({
      ...ROUND,
      id: `ok${i}`,
      maxPlayers: null,
    }));
    const { rounds, gameId } = await setup(json({ version: 1, rounds: [...bad, ...good] }));
    await rounds.pollAll();
    // The first 20 entries are read: 14 bad ones, then 6 good ones.
    expect(rounds.roundsFor(gameId).map((r) => r.id)).toEqual([
      'ok0',
      'ok1',
      'ok2',
      'ok3',
      'ok4',
      'ok5',
    ]);
  });

  it('a higher version is ignored as a whole: no rounds, no failure', async () => {
    const { rounds, gameId, logged } = await setup(json({ version: 2, rounds: [ROUND] }));
    await rounds.pollAll();
    expect(rounds.roundsFor(gameId)).toEqual([]);
    expect(logged).toEqual([]);
  });

  it('too large, too slow, not the contract, a redirect: failures; the last good answer counts 3 minutes', async () => {
    const { rounds, gameId, logged, answer } = await setup(json({ version: 1, rounds: [ROUND] }));
    await rounds.pollAll();
    expect(rounds.roundsFor(gameId)).toHaveLength(1);
    const failures = {
      'too large': json(`{"version":1,"rounds":[],"pad":"${'x'.repeat(70 * 1024)}"}`),
      'not the contract': json({ rounds: [ROUND] }),
      'not JSON': json('<html>oops</html>'),
      redirect: redirect('https://bingo.test/elsewhere'),
      'too slow': (_req, res) =>
        setTimeout(() => json({ version: 1, rounds: [] })(_req, res), 6000),
    };
    for (const handler of Object.values(failures)) {
      answer(handler);
      await rounds.pollAll();
      // Still the last good answer while it is fresh.
      expect(rounds.roundsFor(gameId)).toHaveLength(1);
    }
    expect(rounds.roundsFor(gameId, Date.now() + STALE_MS + 1000)).toEqual([]);
    // Logged once when it began failing (the reasons change, the state does not), never the body.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^\[games\] the sign-up status of game \d+ failed: /);
    expect(logged.join(' ')).not.toContain('oops');
    answer(json({ version: 1, rounds: [] }));
    await rounds.pollAll();
    expect(logged.at(-1)).toMatch(/answers again$/);
    expect(rounds.roundsFor(gameId)).toEqual([]);
  }, 30_000);
});

describe('through the API', () => {
  it("everyone sees each game's open rounds, nobody its status URL", async () => {
    internet = await previewInternet(
      { 'bingo.test/api/open-rounds': json({ version: 1, rounds: [ROUND] }) },
      { 'bingo.test': [PUBLIC_IP] }
    );
    t = makeTestApp({}, { gameStatusNetwork: internet.network });
    const { agent: admin } = await makeStaff(t, 'ada', 'admin');
    const game = {
      name: 'Bingo',
      image: 'winter',
      status: 'available',
      path: '/games/bingo',
      visibility: 'everyone',
    };
    // https only.
    const refused = await admin
      .post('/api/admin/games')
      .send({ ...game, statusUrl: 'http://bingo.test/x' });
    expect(refused.status).toBe(400);
    const created = await admin.post('/api/admin/games').send({ ...game, statusUrl: STATUS });
    expect(created.status).toBe(201);
    expect(created.body.game.statusUrl).toBe(STATUS);
    // Read at once after the save (in the background).
    await expect
      .poll(async () => (await t.client().get('/api/games')).body.games[0].openRounds)
      .toEqual([ROUND]);
    const listed = (await t.client().get('/api/games')).body.games[0];
    expect(listed).not.toHaveProperty('statusUrl');
    expect(JSON.stringify(listed)).not.toContain('/api/open-rounds');
    // Audited with the field, and an edit names it when it changes.
    expect(auditActions(t)).toContain('game.create');
    const edited = await admin
      .put(`/api/admin/games/${created.body.game.id}`)
      .send({ ...game, statusUrl: '' });
    expect(edited.body.game.statusUrl).toBeNull();
    const entry = t.db
      .prepare("SELECT before, after FROM audit_log WHERE action = 'game.edit'")
      .get();
    expect(JSON.parse(entry.before)).toEqual({ statusUrl: STATUS });
    expect(JSON.parse(entry.after)).toEqual({ statusUrl: null });
    await expect
      .poll(async () => (await t.client().get('/api/games')).body.games[0].openRounds)
      .toEqual([]);
  });
});
