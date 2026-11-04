// ============================================================
// File:        statusFixture.js
// Path:        server/src/games/statusFixture.js
// Project:     Seasonal Entertainment
// Description: Development and browser tests only (index.js never uses it in production): a
//              fake game sign-up status (docs/OPEN-ROUNDS.md, "Trying it locally"). The reserved
//              host status.games.test (".test" never resolves on the real internet) answers every
//              path with the file FIXTURE_FILE beside the database, as JSON, read anew on each
//              request (404 while it does not exist); every other host goes to the real
//              internet. safeFetch's guard stays on: the fake host gets a public placeholder
//              address and only its connection is dialled locally, as bots/fixtureNetwork.js does
//              for the fake event bot's images. scripts/dev-game-status.mjs switches it on and off.
// ============================================================

import { readFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

export const FIXTURE_STATUS_HOST = 'status.games.test';
export const FIXTURE_FILE = 'game-status-fixture.json';
// A public address for the guard to accept; nothing is ever sent there (see connect).
const PLACEHOLDER_ADDRESS = '93.184.216.34';

// dir: the folder holding FIXTURE_FILE (the database's); internet: the network every other
// host goes to (chat/mount.js's internetNetwork, the guarded fetch's real one).
export function gameStatusFixtureNetwork(dir, internet) {
  const server = http.createServer(async (_req, res) => {
    try {
      const body = await readFile(path.join(dir, FIXTURE_FILE));
      res.setHeader('Content-Type', 'application/json');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  const ready = new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  server.unref(); // never keeps the dev server alive on its own
  return {
    resolve: async (host) => {
      if (host !== FIXTURE_STATUS_HOST) return internet.resolve(host);
      await ready;
      return [PLACEHOLDER_ADDRESS];
    },
    // The placeholder address is the fake host's; every other address is a real one.
    connect: (target) =>
      target.address === PLACEHOLDER_ADDRESS && target.servername === FIXTURE_STATUS_HOST
        ? net.connect(server.address().port, '127.0.0.1')
        : internet.connect(target),
  };
}
