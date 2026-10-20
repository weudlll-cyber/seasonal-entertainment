// ============================================================
// File:        botMiningRates.test.js
// Path:        server/test/botMiningRates.test.js
// Project:     Seasonal Entertainment
// Description: The price bot's mining rates on /api/prices (server/src/bots/miningRates.js,
//              docs/BOTS.md), as the bot's own load_mine_rates accepts them (its
//              tests/test_fair_prices.py cases): the bot's file format, every season with a rate
//              above 0; a missing season, a rate of 0, a missing file or no key at all: not
//              available. The file is re-read at most every five minutes.
// ============================================================

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makeTestApp } from './helpers/testApp.js';

let dir;
let t;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-rates-'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  t?.close();
  rmSync(dir, { recursive: true, force: true });
});

const NOW = Date.parse('2026-10-21T12:00:00Z');
const write = (data) => {
  const file = path.join(dir, 'mining_rates.json');
  writeFileSync(file, JSON.stringify(data));
  return file;
};
const ratesOn = async (file) => {
  t = makeTestApp({ bots: { priceDb: null, eventDb: null, miningRates: file, cacheMs: 300_000 } });
  return (await request(t.app).get('/api/prices')).body.miningRates;
};
// The bot's own file (bots/stpricebot/src/STpricebot/assets/mining_rates.json).
const BOT_FILE = { Spring: 42.0, Summer: 35.0, Autumn: 60.0, Winter: 52.5 };

it("reads the bot's file: season names in any case, tokens per hour", async () => {
  expect(await ratesOn(write(BOT_FILE))).toEqual({
    spring: 42,
    summer: 35,
    autumn: 60,
    winter: 52.5,
  });
});

it('a missing season or a rate of 0 or less: not available, and the log says why', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  // test_load_mine_rates_missing_token: Winter missing.
  expect(await ratesOn(write({ Spring: 42.0, Summer: 35.0, Autumn: 60.0 }))).toBeNull();
  t.close();
  // test_load_mine_rates_zero_rate: Summer 0.
  expect(await ratesOn(write({ ...BOT_FILE, Summer: 0.0 }))).toBeNull();
  expect(errors.mock.calls.join('\n')).toMatch(/mining rates missing for winter/);
  expect(errors.mock.calls.join('\n')).toMatch(/mining rates must be above 0: summer/);
});

it('no key or no file: not available', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await ratesOn(null)).toBeNull();
  t.close();
  expect(await ratesOn(path.join(dir, 'missing.json'))).toBeNull();
});

it('re-reads the file at most every five minutes', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const file = write(BOT_FILE);
  t = makeTestApp({ bots: { priceDb: null, eventDb: null, miningRates: file, cacheMs: 300_000 } });
  const api = request(t.app);
  expect((await api.get('/api/prices')).body.miningRates.spring).toBe(42);
  write({ ...BOT_FILE, Spring: 44 });
  vi.setSystemTime(NOW + 300_000 - 1);
  expect((await api.get('/api/prices')).body.miningRates.spring).toBe(42);
  vi.setSystemTime(NOW + 300_000);
  expect((await api.get('/api/prices')).body.miningRates.spring).toBe(44);
});
