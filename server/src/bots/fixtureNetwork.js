// ============================================================
// File:        fixtureNetwork.js
// Path:        server/src/bots/fixtureNetwork.js
// Project:     Seasonal Entertainment
// Description: Development only (index.js never uses it in production): the network the event
//              images are fetched through when the event bot is the fake fixture
//              (server/src/bots/fixtures.js). The fixture's images live under the reserved host
//              images.bot-fixtures.test (".test" never resolves on the real internet); that host
//              is answered by a small local file server, and no other host is reached at all.
//              safeFetch's guard stays on: the fixture host gets a public placeholder address,
//              and only its connection is dialled locally — the same technique as the
//              link-preview tests (server/test/helpers/previewNet.js).
// ============================================================

import { readFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const FIXTURE_IMAGE_HOST = 'images.bot-fixtures.test';
// A public address for the guard to accept; nothing is ever sent there (see connect).
const PLACEHOLDER_ADDRESS = '93.184.216.34';
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// dir: the folder holding the fixture's image files (flat; names only, no paths).
export function fixtureImageNetwork(dir) {
  const server = http.createServer(async (req, res) => {
    const match = /^\/([a-z0-9-]+)\.(png|jpg|webp)$/.exec(req.url);
    try {
      if (!match) throw new Error('not a fixture image');
      const body = await readFile(path.join(dir, `${match[1]}.${match[2]}`));
      res.setHeader('Content-Type', TYPES[match[2]]);
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
      if (host !== FIXTURE_IMAGE_HOST) throw new Error(`not the fixture's image host: ${host}`);
      await ready;
      return [PLACEHOLDER_ADDRESS];
    },
    // Only the fixture host gets this far: its connection goes to the local file server.
    connect: () => net.connect(server.address().port, '127.0.0.1'),
  };
}
