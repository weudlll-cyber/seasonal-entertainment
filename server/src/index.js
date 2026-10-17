// ============================================================
// File:        index.js
// Path:        server/src/index.js
// Project:     Seasonal Entertainment
// Description: Server entry point: loads .env (if present), reads configuration, opens the
//              database, adds first-start content, builds the app, starts listening, attaches
//              the chat WebSocket and starts the chat retention job.
// ============================================================

import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { attachChatSocket } from './chat/hub.js';
import { startChatRetention } from './chat/retention.js';
import { seedChatRooms } from './chat/seed.js';
import { readBuildInfo } from './buildInfo.js';
import { ENV_FILE, readConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { seedEvents } from './events/seed.js';
import { seedGames } from './games/seed.js';
import { seedInfoPages } from './info/seed.js';

// Variables already set in the real environment win over the file.
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const config = readConfig();
const buildInfo = readBuildInfo();
const db = openDatabase(config.databasePath);
const seeded = seedInfoPages(db);
if (seeded) console.log(`Added ${seeded} draft info pages (first start)`);
const seededEvents = seedEvents(db);
if (seededEvents) console.log(`Added ${seededEvents} events from the schedule (first start)`);
if (seedGames(db)) console.log('Added the games hub entry (first start)');
if (seedChatRooms(db)) console.log('Added the chat rooms (first start)');
const app = createApp({ buildInfo, config, db });

const server = app.listen(config.port, config.host, () => {
  console.log(
    `Seasonal Entertainment ${buildInfo.version} (${buildInfo.commit}) listening on http://${config.host}:${config.port}`
  );
});
attachChatSocket(server, { app, db, config });
if (config.backgroundJobs) startChatRetention(db, config);
