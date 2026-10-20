// ============================================================
// File:        botData.test.js
// Path:        server/test/botData.test.js
// Project:     Seasonal Entertainment
// Description: Prices and events read from the owner's bots (server/src/bots/, docs/BOTS.md),
//              on fixture databases with the bots' schemas: unset keys answer "not connected";
//              guests get the latest prices with the 24-hour change and a sparkline, and a
//              token's history per range with at most 500 points; the files are never written
//              (query_only, bytes unchanged); answers are cached for five minutes; reads are
//              rate limited; bot occurrences come with the latest override applied, canceled
//              ones marked, inactive events left out, only web links and no image URL; a file
//              that cannot be read answers 503.
// ============================================================

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readBotDb } from '../src/bots/botDb.js';
import { buildEventFixture, buildPriceFixture } from '../src/bots/fixtures.js';
import { makeTestApp } from './helpers/testApp.js';

const NOW = Date.parse('2026-10-21T12:34:00Z'); // a Wednesday
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
let dir;
let files;
let t;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-bots-'));
  files = { prices: path.join(dir, 'snapshots.db'), events: path.join(dir, 'events.db') };
  buildPriceFixture(files.prices, { now: NOW, hours: 40 * 24 });
  buildEventFixture(files.events, { now: NOW });
  return () => rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  t?.close();
});

const appWith = (bots = {}, rateLimits = {}) => {
  t = makeTestApp({
    bots: { priceDb: files.prices, eventDb: files.events, cacheMs: 5 * 60_000, ...bots },
    rateLimits,
  });
  return request(t.app);
};
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const week = (from) => `/api/bot-events?from=${from}&to=${from + 7 * DAY}`;
const MONDAY = Date.parse('2026-10-19T00:00:00Z');

it('unset keys: every read says the data source is not connected', async () => {
  const api = appWith({ priceDb: null, eventDb: null });
  expect((await api.get('/api/prices')).body).toEqual({ ok: true, connected: false, prices: [] });
  expect((await api.get('/api/prices/spring?range=7d')).body).toMatchObject({
    connected: false,
    points: [],
  });
  expect((await api.get(week(MONDAY))).body).toEqual({
    ok: true,
    connected: false,
    occurrences: [],
  });
});

describe('prices', () => {
  it("a guest gets each token's latest price, its 24-hour change and the day's sparkline", async () => {
    const res = await appWith().get('/api/prices');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.prices.map((p) => p.token)).toEqual(['spring', 'summer', 'autumn', 'winter']);
    const db = new Database(files.prices, { readonly: true });
    const at = (ts) =>
      db.prepare("SELECT price FROM snapshots WHERE token = 'summer' AND ts_ms = ?").get(ts).price;
    const summer = res.body.prices[1];
    const last = Math.floor(NOW / HOUR) * HOUR;
    expect(summer.at).toBe(last);
    expect(summer.price).toBe(at(last));
    expect(summer.change24h).toBeCloseTo((at(last) - at(last - DAY)) / at(last - DAY), 12);
    expect(summer.spark).toHaveLength(25); // every hour of the last day, both ends included
    db.close();
  });

  it('history per range, at most 500 points, from the range start to the latest snapshot', async () => {
    const api = appWith();
    const last = Math.floor(NOW / HOUR) * HOUR;
    for (const [range, length, count] of [
      ['24h', DAY, 25],
      ['7d', 7 * DAY, 169],
    ]) {
      const { points } = (await api.get(`/api/prices/winter?range=${range}`)).body;
      expect(points).toHaveLength(count);
      expect(points[0][0]).toBe(last - length);
      expect(points.at(-1)[0]).toBe(last);
    }
    for (const range of ['30d', '1y', 'all']) {
      const { points } = (await api.get(`/api/prices/winter?range=${range}`)).body;
      expect(points.length).toBeLessThanOrEqual(500);
      expect(points.length).toBeGreaterThan(400);
      expect(points.at(-1)[0]).toBe(last); // the latest price is never thinned away
    }
    expect((await api.get('/api/prices/winter?range=5y')).status).toBe(400);
    expect((await api.get('/api/prices/eth?range=7d')).status).toBe(404);
  });
});

it('never writes the bot files: query_only refuses a write, the bytes stay the same', async () => {
  const before = { prices: hash(files.prices), events: hash(files.events) };
  const api = appWith();
  await api.get('/api/prices');
  await api.get('/api/prices/spring?range=all');
  await api.get(week(MONDAY));
  expect(() => readBotDb(files.prices, (db) => db.exec('DELETE FROM snapshots'))).toThrow();
  expect({ prices: hash(files.prices), events: hash(files.events) }).toEqual(before);
});

it('keeps an answer five minutes, then reads the file again', async () => {
  const copy = path.join(dir, 'cache.db');
  buildPriceFixture(copy, { now: NOW, hours: 48 });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const api = appWith({ priceDb: copy });
  const first = (await api.get('/api/prices')).body.prices[0].price;
  const writer = new Database(copy);
  writer.prepare("UPDATE snapshots SET price = 42 WHERE token = 'spring'").run();
  writer.close();
  vi.setSystemTime(NOW + 5 * 60_000 - 1);
  expect((await api.get('/api/prices')).body.prices[0].price).toBe(first);
  vi.setSystemTime(NOW + 5 * 60_000);
  expect((await api.get('/api/prices')).body.prices[0].price).toBe(42);
});

it('limits reads per address', async () => {
  const api = appWith({}, { botRead: { windowMs: 60_000, max: 2 } });
  expect((await api.get('/api/prices')).status).toBe(200);
  expect((await api.get('/api/prices/spring')).status).toBe(200);
  expect((await api.get(week(MONDAY))).status).toBe(429);
});

describe('bot events', () => {
  it('the week as the bot shows it: overrides applied, canceled marked, inactive left out', async () => {
    const res = await appWith().get(week(MONDAY));
    expect(res.body.connected).toBe(true);
    const byName = Object.fromEntries(res.body.occurrences.map((o) => [o.name, o]));
    // Two overrides on Thursday 17:00; the later one (90 minutes later, new label) wins.
    expect(byName['[Sample] Bot Community Call']).toMatchObject({
      start: Date.parse('2026-10-22T18:30:00Z'),
      locationLabel: 'Moved sample channel',
      locationUrl: 'https://example.org/call',
      status: 'scheduled',
    });
    expect(byName['[Sample] Bot Weekend Stream']).toMatchObject({ status: 'canceled' });
    expect(byName['[Sample] Bot Quiz Night']).toMatchObject({ status: 'done' }); // Tuesday, past
    expect(byName['[Sample] Inactive bot event']).toBeUndefined();
    expect(res.body.occurrences).toHaveLength(4);
    expect(res.body.occurrences.every((o) => o.start >= MONDAY && o.start < MONDAY + 7 * DAY)).toBe(
      true
    );
  });

  it('passes on only web links, and never the image URL', async () => {
    const { occurrences } = (await appWith().get(week(MONDAY))).body;
    const stream = occurrences.find((o) => o.name === '[Sample] Bot Weekend Stream');
    expect(stream.locationUrl).toBeNull(); // tg://… is not a web address
    expect(stream.locationLabel).toBe('Not a web link');
    expect(JSON.stringify(occurrences)).not.toContain('never-loaded.png');
  });

  it('refuses a window that is not one of at most eight days', async () => {
    const api = appWith();
    expect((await api.get(`/api/bot-events?from=${MONDAY}&to=${MONDAY + 9 * DAY}`)).status).toBe(
      400
    );
    expect((await api.get('/api/bot-events?from=abc&to=1')).status).toBe(400);
  });
});

it('a configured file that cannot be read answers 503 and logs why', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await appWith({ priceDb: path.join(dir, 'missing.db') }).get('/api/prices');
  expect(res.status).toBe(503);
  expect(res.body.error).toBe('bot_unavailable');
  expect(errors.mock.calls.join(' ')).toMatch(/\[bots\] cannot read .*missing\.db/);
});
