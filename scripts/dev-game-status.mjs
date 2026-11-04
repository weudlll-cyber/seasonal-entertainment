// ============================================================
// File:        dev-game-status.mjs
// Path:        scripts/dev-game-status.mjs
// Project:     Seasonal Entertainment
// Description: Development only: switches a fake game sign-up status on or off (docs/OPEN-ROUNDS.md,
//              "Trying it locally"). `npm run dev:game-status -- on` adds the game "Open rounds
//              test" (its own path, so no other game is touched) with the status URL of the fake
//              host status.games.test, and writes that host's answer, game-status-fixture.json
//              beside the database, with two open rounds (one in two hours, one tomorrow); `off`
//              removes exactly that game and that file. The running server answers the fake host
//              itself (server/src/games/statusFixture.js) and reads it within a minute.
//              Refuses to run against a production configuration.
// ============================================================

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENV_FILE, readConfig } from '../server/src/config.js';
import { openDatabase } from '../server/src/db/database.js';
import { FIXTURE_FILE, FIXTURE_STATUS_HOST } from '../server/src/games/statusFixture.js';

const GAME = {
  name: 'Open rounds test',
  description: 'A test game with a fake sign-up status (scripts/dev-game-status.mjs).',
  image: 'spring',
  path: '/games/open-rounds-test',
  statusUrl: `https://${FIXTURE_STATUS_HOST}/open-rounds`,
};
const HOUR = 60 * 60_000;

// The fake answer: two open rounds, in the contract's shape.
function fixture(now) {
  const round = (id, title, startsIn, players) => ({
    id,
    title,
    kind: 'Seasonal Bingo Royale',
    startsAt: new Date(now + startsIn).toISOString(),
    signupClosesAt: new Date(now + startsIn - 5 * 60_000).toISOString(),
    players,
    maxPlayers: 50,
    joinUrl: `https://${FIXTURE_STATUS_HOST}/rounds/${id}`,
  });
  return {
    version: 1,
    rounds: [
      round('evening', 'Evening Royale', 2 * HOUR, 12),
      round('tomorrow', 'Tomorrow Cup', 26 * HOUR, 3),
    ],
  };
}

const action = process.argv[2];
if (action !== 'on' && action !== 'off') {
  console.error('Usage: npm run dev:game-status -- on | off');
  process.exit(2);
}
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const config = readConfig();
if (config.isProduction) {
  console.error('dev-game-status: development only, never against a production configuration.');
  process.exit(1);
}
const file = path.join(path.dirname(config.databasePath), FIXTURE_FILE);
const db = openDatabase(config.databasePath);
try {
  // Only this script's own game: its path and its status URL together.
  const own = db.prepare('SELECT id FROM games WHERE path = ? AND status_url = ?');
  if (action === 'on') {
    if (!own.get(GAME.path, GAME.statusUrl)) {
      db.prepare(
        `INSERT INTO games (name, description, image, status, path, visibility, status_url, position)
         VALUES (?, ?, ?, 'available', ?, 'everyone', ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM games))`
      ).run(GAME.name, GAME.description, GAME.image, GAME.path, GAME.statusUrl);
    }
    writeFileSync(file, `${JSON.stringify(fixture(Date.now()), null, 2)}\n`);
    console.log(
      `Fake game status on: "${GAME.name}" and ${file}. The site shows it within a minute.`
    );
  } else {
    db.prepare('DELETE FROM games WHERE path = ? AND status_url = ?').run(
      GAME.path,
      GAME.statusUrl
    );
    rmSync(file, { force: true });
    console.log('Fake game status off: the test game and its fixture are gone.');
  }
} finally {
  db.close();
}
