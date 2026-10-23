// ============================================================
// File:        botImages.test.js
// Path:        server/test/botImages.test.js
// Project:     Seasonal Entertainment
// Description: The event bot's images (server/src/bots/images.js, docs/BOTS.md), on a fixture event
//              bot and a pretend internet (helpers/previewNet.js): the server fetches an event's
//              image, re-encodes it as WebP without metadata, stores it by a hash of its URL and
//              serves it from the public media route, and the event then carries its address on
//              this site (never the bot's URL); a private address, plain http or a non-image or an
//              image over 50 megapixels is refused and the event shows without one; each URL is
//              fetched at most once a day. In development the fixture's own image host is served
//              from its files (bots/fixtureNetwork.js), and that network reaches no other host.
// ============================================================

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { buildEventFixture, buildEventImages } from '../src/bots/fixtures.js';
import { fixtureImageNetwork } from '../src/bots/fixtureNetwork.js';
import { botImageFile } from '../src/bots/images.js';
import { largePng } from './helpers/media.js';
import { PUBLIC_IP, html, previewInternet } from './helpers/previewNet.js';
import { makeTestApp } from './helpers/testApp.js';

// The background fetch takes its time on a loaded machine (the 1 s default once ran out
// during a full verify): wait up to 10 s.
const FETCHED = { timeout: 10_000 };

const NOW = Date.parse('2026-10-21T12:34:00Z');
const MONDAY = Date.parse('2026-10-19T00:00:00Z');
const WEEK = `/api/bot-events?from=${MONDAY}&to=${MONDAY + 7 * 24 * 60 * 60_000}`;
const QUIZ = 'https://images.bot-fixtures.test/quiz.png';
const HOST = 'images.bot-fixtures.test';
let dir;
let eventDb;
let t;
let net;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'se-bot-images-'));
  eventDb = path.join(dir, 'events.db');
  buildEventFixture(eventDb, { now: NOW });
  return () => rmSync(dir, { recursive: true, force: true });
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  t?.close();
  await net?.close();
});

// A JPEG carrying EXIF (a copyright and a GPS-like comment), served as the quiz image.
async function photo() {
  return sharp({ create: { width: 800, height: 400, channels: 3, background: '#afb84e' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret owner', ImageDescription: 'GPS 48.2,16.3' } })
    .toBuffer();
}
const image = (buffer, type) => (_req, res) => {
  res.setHeader('Content-Type', type);
  res.end(buffer);
};

async function appOn(routes, dns = { [HOST]: [PUBLIC_IP] }) {
  net = await previewInternet(routes, dns);
  t = makeTestApp(
    { bots: { priceDb: null, eventDb, cacheMs: 5 * 60_000 } },
    { botImageNetwork: net.network }
  );
  return request(t.app);
}
const quizOf = async (api) =>
  (await api.get(WEEK)).body.occurrences.find((o) => o.name === '[Sample] Bot Quiz Night');

it('fetches the image, stores it as WebP without metadata, and serves it from this site', async () => {
  const api = await appOn({ [`${HOST}/quiz.png`]: image(await photo(), 'image/jpeg') });
  expect((await quizOf(api)).image).toBeNull(); // not fetched yet: the event shows without one
  await vi.waitFor(async () => expect((await quizOf(api)).image).not.toBeNull(), FETCHED);

  const { image: address } = await quizOf(api);
  expect(address).toMatch(/^\/media\/bot-images\/[0-9a-f]{32}\.webp\?v=\d+$/);
  expect(address).not.toContain(HOST); // the bot's own URL is never passed on
  const stored = path.join(t.config.mediaDir, botImageFile(QUIZ));
  expect(address.split('?')[0]).toBe(`/media/${botImageFile(QUIZ)}`);
  // Read into memory first: sharp keeps files it opened, and the folder must go afterwards.
  const meta = await sharp(readFileSync(stored)).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.width).toBe(640); // scaled down to the configured width
  expect(meta.exif).toBeUndefined();

  const served = await api.get(address);
  expect(served.status).toBe(200);
  expect(served.headers['content-type']).toBe('image/webp');
  // Only exact generated names: anything else under the folder is not served.
  expect((await api.get('/media/bot-images/../events.db')).status).toBe(404);
});

it('a private address, plain http or something that is no image: no image, nothing stored', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const api = await appOn(
    {
      [`${HOST}/quiz.png`]: image(await photo(), 'image/jpeg'),
      [`${HOST}/call.png`]: html('<p>not an image</p>'),
    },
    { [HOST]: ['10.0.0.5'] } // the bot's image host resolves to a private address
  );
  await api.get(WEEK);
  await vi.waitFor(() => expect(warn.mock.calls.length).toBeGreaterThanOrEqual(3), FETCHED);
  const week = (await api.get(WEEK)).body.occurrences;
  expect(week.every((o) => o.image === null)).toBe(true);
  expect(net.dialled).toEqual([]); // the private address was never contacted
  expect(warn.mock.calls.join('\n')).toMatch(/event image not used \(address not allowed\)/);
  expect(warn.mock.calls.join('\n')).toMatch(/event image not used \(https only\)/); // the stream
  expect(existsSync(path.join(t.config.mediaDir, 'bot-images'))).toBe(false);
});

// 8000 x 6000 is 48 megapixels and 8500 x 6000 is 51, both under 60 KB: only the pixel count
// tells them apart, read from the header before decoding.
it('an image over 50 megapixels is refused, one of 48 is used', { timeout: 60_000 }, async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const api = await appOn({
    [`${HOST}/quiz.png`]: image(await largePng(8000, 6000), 'image/png'),
    [`${HOST}/call.png`]: image(await largePng(8500, 6000), 'image/png'),
  });
  await api.get(WEEK);
  const timeout = { timeout: 30_000 };
  await vi.waitFor(async () => expect((await quizOf(api)).image).not.toBeNull(), timeout);
  const warned = () => warn.mock.calls.join('\n');
  await vi.waitFor(() => expect(warned()).toMatch(/call\.png/), timeout);
  expect(warned()).toMatch(/event image not used \(.*50 megapixels.*call\.png/);
  const week = (await api.get(WEEK)).body.occurrences;
  expect(week.find((o) => o.name === '[Sample] Bot Community Call').image).toBeNull();
});

it('fetches each image at most once a day', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const api = await appOn({ [`${HOST}/quiz.png`]: image(await photo(), 'image/jpeg') });
  await vi.waitFor(async () => expect((await quizOf(api)).image).not.toBeNull(), FETCHED);
  for (let i = 0; i < 3; i += 1) await api.get(WEEK);
  expect(net.hits(`${HOST}/quiz.png`)).toBe(1);

  // Over a day after it was stored (the clock runs on meanwhile): fetched again, once.
  vi.setSystemTime(NOW + 24 * 60 * 60_000 + 60_000);
  await api.get(WEEK);
  await vi.waitFor(() => expect(net.hits(`${HOST}/quiz.png`)).toBe(2), FETCHED);
  await api.get(WEEK);
  expect(net.hits(`${HOST}/quiz.png`)).toBe(2);
});

it("development: the fixture's images come from its files; no other host is reached", async () => {
  const images = path.join(dir, 'images');
  await buildEventImages(images);
  const network = fixtureImageNetwork(images);
  t = makeTestApp(
    { bots: { priceDb: null, eventDb, cacheMs: 5 * 60_000 } },
    { botImageNetwork: network }
  );
  const api = request(t.app);
  await vi.waitFor(async () => expect((await quizOf(api)).image).not.toBeNull(), FETCHED);
  expect((await api.get((await quizOf(api)).image)).status).toBe(200);
  await expect(network.resolve('example.org')).rejects.toThrow(/not the fixture's image host/);
});
