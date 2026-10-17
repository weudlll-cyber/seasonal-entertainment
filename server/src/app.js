// ============================================================
// File:        app.js
// Path:        server/src/app.js
// Project:     Seasonal Entertainment
// Description: Builds the Express app: security headers, JSON API under /api and, when a
//              built client exists, the static client with a fallback to index.html for the
//              client-side routes. Kept free of listen() so tests can drive it directly.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { securityHeaders } from './http/securityHeaders.js';

export function createApp({ buildInfo, clientDist }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());

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
    // Any other GET is a client route (/events, /info/faq, ...): the client decides, and
    // shows its own 404 page for paths it does not know.
    app.get('/{*clientRoute}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
