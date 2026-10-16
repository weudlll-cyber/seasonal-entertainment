// ============================================================
// File:        app.js
// Path:        server/src/app.js
// Project:     Seasonal Entertainment
// Description: Builds the Express app: JSON API under /api and, when a built client exists,
//              the static client. Kept free of listen() so tests can drive it directly.
// ============================================================

import { existsSync } from 'node:fs';
import express from 'express';

export function createApp({ buildInfo, clientDist }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: buildInfo.version, commit: buildInfo.commit });
  });

  // Unknown API paths answer JSON, never the HTML page.
  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'not_found' });
  });

  // One process in production: the same server hands out the built client.
  if (clientDist && existsSync(clientDist)) {
    app.use(express.static(clientDist));
  }

  return app;
}
