// ============================================================
// File:        build-bot-fixtures.mjs
// Path:        scripts/build-bot-fixtures.mjs
// Project:     Seasonal Entertainment
// Description: `npm run dev:bot-fixtures`: builds the two development stand-ins for the
//              owner's bot databases (server/src/bots/fixtures.js: the bots' exact schemas,
//              clearly fake seeded data, the event images beside them in images/) into
//              data/bot-fixtures/ (gitignored, like all of data/), or into BOT_FIXTURE_DIR when
//              set (the browser tests' own folder).
//              `npm run dev` points PRICE_BOT_DB and EVENT_BOT_DB there when they are not set
//              (docs/BOTS.md). Run again to move the sample week to the current one.
// ============================================================

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEventFixture,
  buildEventImages,
  buildMiningRates,
  buildPriceFixture,
} from '../server/src/bots/fixtures.js';

export const FIXTURE_DIR =
  process.env.BOT_FIXTURE_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bot-fixtures');
export const FIXTURE_FILES = {
  PRICE_BOT_DB: path.join(FIXTURE_DIR, 'snapshots.db'),
  EVENT_BOT_DB: path.join(FIXTURE_DIR, 'stannouncebot.db'),
  PRICE_BOT_MINING_RATES: path.join(FIXTURE_DIR, 'mining_rates.json'),
};

// Only when run as the script (dev.mjs imports the paths above).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw new Error('bot fixtures are for development');
  mkdirSync(FIXTURE_DIR, { recursive: true });
  buildPriceFixture(FIXTURE_FILES.PRICE_BOT_DB);
  buildMiningRates(FIXTURE_FILES.PRICE_BOT_MINING_RATES);
  buildEventFixture(FIXTURE_FILES.EVENT_BOT_DB);
  // Beside the event database: where the development server's fixture network serves them.
  await buildEventImages(path.join(FIXTURE_DIR, 'images'));
  console.log(`Fake bot data (development only) written to ${FIXTURE_DIR}`);
}
