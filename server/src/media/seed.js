// ============================================================
// File:        seed.js
// Path:        server/src/media/seed.js
// Project:     Seasonal Entertainment
// Description: First-start chat media: when the library has no packs, the starter pack in
//              server/seeds/chat-media/ (made from the owner's own files; sources and credits
//              in its README) becomes four packs. Each file passes the same check as an upload
///              and is copied into the media folder under a generated name. Safe when two
//              starts run at once: only one of them seeds.
// ============================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveMediaFile } from './files.js';
import { checkImage, libraryRules } from './imageCheck.js';
import { addItem, countPacks, createPack } from './store.js';

export const SEED_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'seeds',
  'chat-media'
);

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const title = (word) => word[0].toUpperCase() + word.slice(1);

// [pack name, kind, folder, [[file stem, name, alt text, credit?], ...]]
export const SEED_PACKS = [
  [
    'Seasons',
    'sticker',
    'stickers',
    SEASONS.flatMap((s) => [
      [`season-${s}-badge`, `${title(s)} badge`, `${title(s)} season badge`],
      [`season-${s}-ring`, `${title(s)} ring`, `${title(s)} season icon in a ring`],
    ]),
  ],
  [
    'Coins',
    'sticker',
    'stickers',
    [
      ...SEASONS.map((s) => [`coin-${s}`, `${title(s)} coin`, `Gold ${s} token coin`]),
      ['coin-st', 'ST coin', 'Gold Seasonal Tokens coin'],
      ...SEASONS.map((s) => [
        `coin-silver-${s}`,
        `Silver ${s} coin`,
        `Silver ${s} token coin`,
        'Foxeane',
      ]),
    ],
  ],
  [
    'Seasonal Tokens',
    'sticker',
    'stickers',
    [['st-logo-silver', 'ST silver logo', 'Silver Seasonal Tokens logo']],
  ],
  [
    'Seasonal Tokens',
    'gif',
    'gifs',
    [
      ['st-logo-spin-x', 'ST logo spin (X)', 'Seasonal Tokens logo spinning around its X axis'],
      ['st-logo-spin-y', 'ST logo spin (Y)', 'Seasonal Tokens logo spinning around its Y axis'],
      ['st-logo-spin-xyz', 'ST logo spin (XYZ)', 'Seasonal Tokens logo spinning on all axes'],
      ['welcome-to-seasonal-tokens', 'Welcome', 'Animated title: Welcome to Seasonal Tokens'],
    ],
  ],
];

const EXTENSION = { stickers: 'webp', gifs: 'gif' };

// Returns the number of items added (0 when the library already has packs).
export async function seedChatMedia(db, config, sourceDir = SEED_DIR) {
  if (countPacks(db) > 0) return 0; // the usual case: nothing to check or copy
  // Check and copy every file first, so a bad file leaves no half-made library behind.
  const prepared = [];
  for (const [packName, kind, folder, items] of SEED_PACKS) {
    for (const [stem, name, alt, credit] of items) {
      const buffer = readFileSync(path.join(sourceDir, folder, `${stem}.${EXTENSION[folder]}`));
      const image = await checkImage(buffer, libraryRules(config, kind));
      prepared.push({ packName, kind, text: { name, alt, credit }, image, buffer });
    }
  }
  // Checked again inside the write: the image checks above take time, and another start
  // (a restarting dev server) may have seeded meanwhile. SQLite runs writes one at a time.
  return db.transaction(() => {
    if (countPacks(db) > 0) return 0;
    const packs = new Map();
    for (const { packName, kind, text, image, buffer } of prepared) {
      const key = `${kind}:${packName}`;
      if (!packs.has(key)) packs.set(key, createPack(db, { name: packName, kind }).id);
      const file = saveMediaFile(config, buffer, image.ext);
      addItem(db, packs.get(key), text, image, file, buffer.length);
    }
    return prepared.length;
  })();
}
