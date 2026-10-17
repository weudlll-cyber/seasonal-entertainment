// ============================================================
// File:        mediaSeed.test.js
// Path:        server/test/mediaSeed.test.js
// Project:     Seasonal Entertainment
// Description: Guards the first-start chat media: an empty library gets the four starter packs
//              with their items in order, the Foxeane credit on the silver coins only, and the
//              files copied under generated names; a second start adds nothing.
// ============================================================

import { readdirSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { seedChatMedia } from '../src/media/seed.js';
import { listLibrary } from '../src/media/store.js';
import { makeTestApp } from './helpers/testApp.js';

let t;
afterEach(() => t?.close());

// Real work on 22 images (about a second alone); slower while other test files run.
it('fills an empty library once, with the starter packs', { timeout: 30_000 }, async () => {
  t = makeTestApp();
  expect(await seedChatMedia(t.db, t.config)).toBe(22);
  const packs = listLibrary(t.db);
  expect(packs.map((p) => [p.name, p.kind, p.items.length])).toEqual([
    ['Seasons', 'sticker', 8],
    ['Coins', 'sticker', 9],
    ['Seasonal Tokens', 'sticker', 1],
    ['Seasonal Tokens', 'gif', 4],
  ]);
  expect(packs[0].items.slice(0, 2).map((i) => [i.name, i.alt])).toEqual([
    ['Spring badge', 'Spring season badge'],
    ['Spring ring', 'Spring season icon in a ring'],
  ]);
  const credited = packs.flatMap((p) => p.items).filter((i) => i.credit);
  expect(credited.map((i) => [i.name, i.credit])).toEqual([
    ['Silver spring coin', 'Foxeane'],
    ['Silver summer coin', 'Foxeane'],
    ['Silver autumn coin', 'Foxeane'],
    ['Silver winter coin', 'Foxeane'],
  ]);
  expect(packs[3].items.map((i) => i.mime)).toEqual(Array(4).fill('image/gif'));
  const files = readdirSync(t.config.mediaDir);
  expect(files).toHaveLength(22);
  expect(files.every((f) => /^[0-9a-f]{32}\.(webp|gif)$/.test(f))).toBe(true);

  expect(await seedChatMedia(t.db, t.config)).toBe(0);
  expect(listLibrary(t.db).flatMap((p) => p.items)).toHaveLength(22);
  expect(readdirSync(t.config.mediaDir)).toHaveLength(22);
});
