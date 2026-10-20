// ============================================================
// File:        referencePrices.test.js
// Path:        server/test/referencePrices.test.js
// Project:     Seasonal Entertainment
// Description: ETH and POL from CoinGecko (server/src/reference/, docs/BOTS.md), against a fake
//              fetch: without a key both routes say not connected; the first run stores a year
//              of daily and 90 days of hourly prices per coin (the right coin ids, USD, the key
//              in the demo header and never in the URL, a pause between calls); the routes then
//              give the latest price with its 24-hour change and the history per range; the next
//              hour fetches only the last two days, the next day everything again and drops
//              what is over a year old; a failed fetch keeps the stored prices, logs once and
//              waits an hour.
// ============================================================

import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createReferenceSync } from '../src/reference/sync.js';
import { makeTestApp } from './helpers/testApp.js';

const KEY = 'CG-demo-test-key';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-21T12:00:00Z');
let t;
afterEach(() => {
  vi.restoreAllMocks();
  t?.close();
});

// A pretend CoinGecko: prices that rise by 1 % a day (ETH from 2000, POL from 0.2), daily
// points beyond 90 days, hourly within, as the Demo plan answers.
function fakeCoinGecko({ fail = false } = {}) {
  const calls = [];
  const fetchImpl = vi.fn(async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (fail) return { ok: false, status: 429, json: async () => ({}) };
    const days = Number(new URL(url).searchParams.get('days'));
    const base = url.includes('/coins/ethereum/') ? 2000 : 0.2;
    const step = days > 90 ? DAY : HOUR;
    const prices = [];
    for (let ms = NOW - days * DAY; ms <= clock.now; ms += step) {
      prices.push([ms, base * 1.01 ** ((ms - (NOW - 400 * DAY)) / DAY)]);
    }
    return { ok: true, json: async () => ({ prices }) };
  });
  return { calls, fetchImpl };
}
const clock = { now: NOW };

function setUp(options = {}) {
  t = makeTestApp({ coingecko: { apiKey: KEY, timeoutMs: 1000, gapMs: 2500 } });
  const sleep = vi.fn(async () => {});
  const log = vi.fn();
  const cg = fakeCoinGecko(options);
  const sync = createReferenceSync(t.db, t.config, {
    fetchImpl: cg.fetchImpl,
    now: () => clock.now,
    log,
    sleep,
  });
  return { sync, sleep, log, cg, api: request(t.app) };
}
const days = (calls) =>
  calls.map(
    (c) => `${c.url.match(/coins\/([^/]+)/)[1]}:${new URL(c.url).searchParams.get('days')}`
  );

it('without a key both routes say not connected', async () => {
  t = makeTestApp();
  const api = request(t.app);
  expect((await api.get('/api/reference-prices')).body).toEqual({
    ok: true,
    connected: false,
    prices: [],
  });
  expect((await api.get('/api/reference-prices/eth?range=7d')).body).toMatchObject({
    connected: false,
    points: [],
  });
});

it('the first run stores a year of daily and 90 days of hourly prices per coin, then serves them', async () => {
  clock.now = NOW;
  const { sync, sleep, cg, api } = setUp();
  await sync.tick();
  expect(days(cg.calls)).toEqual([
    'ethereum:365',
    'ethereum:90',
    'polygon-ecosystem-token:365',
    'polygon-ecosystem-token:90',
  ]);
  for (const call of cg.calls) {
    expect(call.url).toMatch(
      /^https:\/\/api\.coingecko\.com\/api\/v3\/coins\/.+\/market_chart\?vs_currency=usd&days=\d+$/
    );
    expect(call.url).not.toContain(KEY);
    expect(call.headers['x-cg-demo-api-key']).toBe(KEY);
  }
  expect(sleep.mock.calls).toEqual([[2500], [2500], [2500]]); // a pause between the calls

  const latest = (await api.get('/api/reference-prices')).body;
  expect(latest.connected).toBe(true);
  expect(latest.prices.map((p) => p.token)).toEqual(['eth', 'pol']);
  const eth = latest.prices[0];
  expect(eth.at).toBe(NOW);
  expect(eth.change24h).toBeCloseTo(0.01, 6); // 1 % a day
  expect(eth.spark).toHaveLength(25);
  const year = (await api.get('/api/reference-prices/eth?range=1y')).body.points;
  expect(year[0][0]).toBe(NOW - 365 * DAY);
  expect(year.length).toBeLessThanOrEqual(500);
  expect((await api.get('/api/reference-prices/eth?range=24h')).body.points).toHaveLength(25);
  expect((await api.get('/api/reference-prices/btc')).status).toBe(404);
});

it('the next hour fetches the last two days only; the next day everything, without old data', async () => {
  clock.now = NOW;
  const { sync, cg } = setUp();
  await sync.tick();
  cg.calls.length = 0;
  clock.now = NOW + 10 * 60_000;
  await sync.tick();
  expect(cg.calls).toEqual([]); // within the hour: nothing

  clock.now = NOW + HOUR;
  await sync.tick();
  expect(days(cg.calls)).toEqual(['ethereum:2', 'polygon-ecosystem-token:2']);

  // Something older than a year (e.g. left from before): gone with the next full run.
  t.db
    .prepare("INSERT INTO reference_prices (ts_ms, token, price) VALUES (?, 'eth', 1)")
    .run(NOW - 400 * DAY);
  cg.calls.length = 0;
  clock.now = NOW + DAY;
  await sync.tick();
  expect(days(cg.calls)).toEqual([
    'ethereum:365',
    'ethereum:90',
    'polygon-ecosystem-token:365',
    'polygon-ecosystem-token:90',
  ]);
  const oldest = t.db.prepare('SELECT MIN(ts_ms) AS ms FROM reference_prices').get().ms;
  expect(oldest).toBeGreaterThanOrEqual(clock.now - 365 * DAY);
});

it('a failed fetch keeps the stored prices, logs once, and that coin waits an hour', async () => {
  clock.now = NOW;
  const ok = setUp();
  await ok.sync.tick();
  const stored = t.db.prepare('SELECT COUNT(*) AS n FROM reference_prices').get().n;
  const failing = fakeCoinGecko({ fail: true });
  const log = vi.fn();
  const sync = createReferenceSync(t.db, t.config, {
    fetchImpl: failing.fetchImpl,
    now: () => clock.now,
    log,
    sleep: async () => {},
  });
  clock.now = NOW + HOUR;
  await sync.tick();
  expect(failing.calls).toHaveLength(2); // one try per coin
  expect(t.db.prepare('SELECT COUNT(*) AS n FROM reference_prices').get().n).toBe(stored);
  expect(log.mock.calls.map((c) => c[0])).toEqual([
    '[reference] CoinGecko eth: status 429; the stored prices stay',
    '[reference] CoinGecko pol: status 429; the stored prices stay',
  ]);
  clock.now = NOW + HOUR + 30 * 60_000;
  await sync.tick();
  expect(failing.calls).toHaveLength(2); // waits an hour after a failure
  clock.now = NOW + 2 * HOUR + 1;
  await sync.tick();
  expect(failing.calls).toHaveLength(4);
  expect(log).toHaveBeenCalledTimes(2); // the same failure is not logged again
  expect((await ok.api.get('/api/reference-prices')).body.prices).toHaveLength(2);
});
