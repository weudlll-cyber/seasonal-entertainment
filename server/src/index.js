// ============================================================
// File:        index.js
// Path:        server/src/index.js
// Project:     Seasonal Entertainment
// Description: Server entry point: loads .env (if present), reads configuration, opens the
//              database, encrypts any 2FA secret still stored in plain text (twofa/secretBox.js),
//              adds first-start content (and brings never-edited seeded info pages up to the
//              current seed text, info/seed.js), builds the app (in development with the fake
//              event bot's image files, bots/fixtureNetwork.js), starts the chat (its own
//              first-start content and retention job), the stale-call and reminder jobs, the
//              reference prices job (with a CoinGecko key), the weekly recap and the daily
//              Discord role read (while Discord is set up), seeds the Discord steps once (the
//              project's discord/seed/, icons through the chat's icon pipeline), starts
//              listening and attaches the chat WebSocket.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { fixtureImageNetwork } from './bots/fixtureNetwork.js';
import { readBuildInfo } from './buildInfo.js';
import { ENV_FILE, readConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { seedSteps } from './discord/steps.js';
import { seedGames } from './games/seed.js';
import { refreshSeedPages, seedInfoPages } from './info/seed.js';
import { sealStoredSecrets } from './twofa/secretBox.js';

// Variables already set in the real environment win over the file.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const config = readConfig();
const buildInfo = readBuildInfo();
const db = openDatabase(config.databasePath);
await sealStoredSecrets(db, config.secretKey);
const seeded = seedInfoPages(db);
if (seeded) console.log(`Added ${seeded} info pages, Imprint and Privacy as drafts (first start)`);
const refreshed = refreshSeedPages(db);
if (refreshed) console.log(`Updated ${refreshed} unedited info pages to the current seed text`);
if (seedGames(db)) console.log('Added the games hub entry (first start)');
// Development only, with the fake event bot (its images/ folder beside the database): its
// images come from those files. Otherwise (production, or a copy of the real bot) the
// real internet.
const fixtureImages = config.bots.eventDb && path.join(path.dirname(config.bots.eventDb), 'images');
const botImageNetwork =
  !config.isProduction && fixtureImages && existsSync(fixtureImages)
    ? fixtureImageNetwork(fixtureImages)
    : undefined;
const app = createApp({ buildInfo, config, db, botImageNetwork });
// After the app: the steps' icons go through the chat's icon pipeline (images.storeIcon).
const steps = await seedSteps(db, { storeIcon: app.locals.chat.images.storeIcon });
if (steps) console.log(`Added ${steps} Discord steps from the project's seed (first start)`);
await app.locals.chat.start();
app.locals.calls.start();
app.locals.reference.start();
app.locals.recap.start();
app.locals.discord.start();

const server = app.listen(config.port, config.host, () => {
  console.log(
    `Seasonal Entertainment ${buildInfo.version} (${buildInfo.commit}) listening on http://${config.host}:${config.port}`
  );
});
app.locals.chat.attach(server);
