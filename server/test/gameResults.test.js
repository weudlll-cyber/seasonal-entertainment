// ============================================================
// File:        gameResults.test.js
// Path:        server/test/gameResults.test.js
// Project:     Seasonal Entertainment
// Description: A member's game results on their profile (games/memberSummary.js, the route in
//              profiles/routes.js; docs/GAME-INTEGRATION.md, "A member's results on their
//              profile"): the contract's limits (at most four values, label and value lengths,
//              "no data"), the request a game gets (its path, the user id, the sync token), a
//              card per answering game for signed-in members only, "Show my game results" off
//              (the games are not asked), a failing, slow, oversized or invalid game left out
//              without holding up the profile, the answers kept a few minutes, and
//              GAMES_LOCAL_ORIGINS read strictly.
// ============================================================

import { afterEach, describe, expect, it } from 'vitest';
import { readLocalOrigins } from '../src/games/embedded.js';
import { CACHE_MS, createGameResults, parseSummary } from '../src/games/memberSummary.js';
import { startFakeGame } from './helpers/fakeGame.js';
import { makeTestApp, registerUser } from './helpers/testApp.js';

const TOKEN = 'a-sync-token-of-at-least-32-characters';
const CARD = {
  values: [
    { label: 'Played', value: 12 },
    { label: 'Wins', value: 3 },
    { label: 'Best place', value: '2nd' },
  ],
  lastPlayedAt: '2026-11-13T19:00:00Z',
};

let t;
let games = [];
afterEach(async () => {
  t?.close();
  t = undefined;
  await Promise.all(games.map((game) => game.close()));
  games = [];
});

async function fakeGame(slug, answers) {
  const game = await startFakeGame({ slug, token: TOKEN, answers });
  games.push(game);
  return game;
}

// The app with the games switched on and asked at the fake games' origins.
function app(localOrigins, extra = {}) {
  t = makeTestApp({
    games: { embedded: ['bingo', 'mini-games'], syncToken: TOKEN, localOrigins, ...extra },
  });
}

describe('the contract', () => {
  it('takes up to four values within their lengths, and "no data"', () => {
    expect(parseSummary(CARD)).toEqual({
      values: [
        { label: 'Played', value: '12' },
        { label: 'Wins', value: '3' },
        { label: 'Best place', value: '2nd' },
      ],
      lastPlayedAt: '2026-11-13T19:00:00.000Z',
    });
    expect(parseSummary({ values: [{ label: ' Played ', value: 0 }] })).toEqual({
      values: [{ label: 'Played', value: '0' }],
      lastPlayedAt: null,
    });
    expect(parseSummary({ noData: true })).toBeNull();
  });

  it.each([
    ['five values', { values: Array(5).fill({ label: 'Played', value: 1 }) }],
    ['no values', { values: [] }],
    ['a label of 25 characters', { values: [{ label: 'x'.repeat(25), value: 1 }] }],
    ['a value of 17 characters', { values: [{ label: 'Played', value: 'x'.repeat(17) }] }],
    ['a control character', { values: [{ label: 'Pla\nyed', value: 1 }] }],
    ['a negative number', { values: [{ label: 'Played', value: -1 }] }],
    ['a fraction', { values: [{ label: 'Played', value: 1.5 }] }],
    ['an object as value', { values: [{ label: 'Played', value: { a: 1 } }] }],
    ['a wrong time', { ...CARD, lastPlayedAt: 'yesterday' }],
    ['a list', [CARD]],
  ])('refuses %s', (_name, body) => {
    expect(() => parseSummary(body)).toThrow();
  });
});

describe('the profile route', () => {
  it('asks each game with the token and the user id; members see the cards', async () => {
    const bingo = await fakeGame('bingo', {});
    const mini = await fakeGame('mini-games', {});
    app({ bingo: bingo.origin, 'mini-games': mini.origin });
    const { agent, user: mia } = await registerUser(t, 'mia');
    // Answers keyed by the website user id, as the games know their players.
    bingo.answers[mia.id] = CARD;

    const res = await agent.get('/api/members/mia/games');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.games).toEqual([
      {
        slug: 'bingo',
        name: 'Seasonal Bingo Royale',
        path: '/games/bingo',
        values: [
          { label: 'Played', value: '12' },
          { label: 'Wins', value: '3' },
          { label: 'Best place', value: '2nd' },
        ],
        lastPlayedAt: '2026-11-13T19:00:00.000Z',
      },
    ]);
    expect(bingo.requests).toEqual([
      { path: '/games/bingo/api/website/member-summary', user: String(mia.id), token: TOKEN },
    ]);
    // Mini Games knows no such player (404): no card, no error.
    expect(mini.requests).toHaveLength(1);
    expect((await t.client().get('/api/members/mia/games')).status).toBe(401);
  });

  it('"Show my game results" off: no cards, and the games are not asked', async () => {
    const bingo = await fakeGame('bingo', {});
    app({ bingo: bingo.origin });
    const { agent, user: mia } = await registerUser(t, 'mia');
    bingo.answers[mia.id] = CARD;
    const { agent: tom } = await registerUser(t, 'tom');
    expect((await agent.get('/api/members/mia')).body.profile.showGameResults).toBe(true);
    expect((await tom.get('/api/members/mia')).body.profile).not.toHaveProperty('showGameResults');

    expect((await agent.put('/api/profile/game-results').send({ show: false })).status).toBe(200);
    expect((await agent.get('/api/members/mia')).body.profile.showGameResults).toBe(false);
    expect((await tom.get('/api/members/mia/games')).body.games).toEqual([]);
    expect((await agent.get('/api/members/mia/games')).body.games).toEqual([]);
    expect(bingo.requests).toEqual([]);
    expect((await agent.put('/api/profile/game-results').send({ show: 'no' })).status).toBe(400);

    await agent.put('/api/profile/game-results').send({ show: true });
    expect((await tom.get('/api/members/mia/games')).body.games).toHaveLength(1);
  });

  it.each([
    ['a server error', { status: 500, body: CARD }],
    ['a refused token', { status: 401, body: CARD }],
    [
      'an oversized answer',
      { status: 200, raw: JSON.stringify({ ...CARD, pad: 'x'.repeat(5000) }) },
    ],
    ['broken JSON', { status: 200, raw: '{"values": [' }],
    ['five values', { status: 200, body: { values: Array(5).fill({ label: 'A', value: 1 }) } }],
  ])('%s leaves that card out, the others stay', async (_name, broken) => {
    const bingo = await fakeGame('bingo', {});
    const mini = await fakeGame('mini-games', {});
    app({ bingo: bingo.origin, 'mini-games': mini.origin });
    const { agent, user: mia } = await registerUser(t, 'mia');
    bingo.answers[mia.id] = broken;
    mini.answers[mia.id] = CARD;
    const res = await agent.get('/api/members/mia/games');
    expect(res.status).toBe(200);
    expect(res.body.games.map((card) => card.slug)).toEqual(['mini-games']);
  });

  it('a slow game is left out after the timeout; the profile itself never waits', async () => {
    const bingo = await fakeGame('bingo', {});
    app({ bingo: bingo.origin });
    const { agent, user: mia } = await registerUser(t, 'mia');
    bingo.answers[mia.id] = { status: 200, body: CARD, delayMs: 4000 };
    let started = Date.now();
    expect((await agent.get('/api/members/mia')).status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
    started = Date.now();
    expect((await agent.get('/api/members/mia/games')).body.games).toEqual([]);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('without a local origin or without the token, no game is asked', async () => {
    const bingo = await fakeGame('bingo', {});
    app({});
    const { agent } = await registerUser(t, 'mia');
    expect((await agent.get('/api/members/mia/games')).body.games).toEqual([]);
    t.close();
    app({ bingo: bingo.origin }, { syncToken: null });
    const { agent: again } = await registerUser(t, 'mia');
    expect((await again.get('/api/members/mia/games')).body.games).toEqual([]);
    expect(bingo.requests).toEqual([]);
  });
});

describe('the cache', () => {
  it('keeps an answer five minutes and a failure one, then asks again', async () => {
    const bingo = await fakeGame('bingo', { 7: CARD, 8: { status: 500, body: {} } });
    let clock = 0;
    const results = createGameResults(
      { embedded: ['bingo'], syncToken: TOKEN, localOrigins: { bingo: bingo.origin } },
      { now: () => clock }
    );
    expect(await results.cardsFor(7)).toHaveLength(1);
    expect(await results.cardsFor(8)).toEqual([]);
    clock = CACHE_MS.failure - 1;
    await results.cardsFor(7);
    await results.cardsFor(8);
    expect(bingo.requests).toHaveLength(2);
    clock = CACHE_MS.failure;
    await results.cardsFor(8);
    expect(bingo.requests).toHaveLength(3);
    clock = CACHE_MS.answer;
    expect(await results.cardsFor(7)).toHaveLength(1);
    expect(bingo.requests).toHaveLength(4);
  });
});

describe('GAMES_LOCAL_ORIGINS', () => {
  it('takes slug=origin entries of known games', () => {
    expect(readLocalOrigins('bingo=http://127.0.0.1:4310, race=https://race.local:8443/')).toEqual({
      bingo: 'http://127.0.0.1:4310',
      race: 'https://race.local:8443',
    });
    expect(readLocalOrigins(undefined)).toEqual({});
  });

  it.each([
    'chess=http://127.0.0.1:1',
    'bingo=ftp://127.0.0.1:1',
    'bingo=http://127.0.0.1:1/games',
    'bingo=http://user@127.0.0.1:1',
    'bingo',
  ])('refuses %s', (value) => {
    expect(() => readLocalOrigins(value)).toThrow(/GAMES_LOCAL_ORIGINS/);
  });
});
