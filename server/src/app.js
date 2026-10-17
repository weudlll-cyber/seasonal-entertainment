// ============================================================
// File:        app.js
// Path:        server/src/app.js
// Project:     Seasonal Entertainment
// Description: Builds the Express app: security headers, CSRF origin check, sessions, the
//              JSON API under /api and, when a built client exists, the static client with a
//              fallback to index.html for client routes. No listen(), so tests drive it directly.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { bootstrapRoutes } from './accounts/bootstrap.js';
import { adminAuditRoutes } from './admin/auditRoutes.js';
import { adminUserRoutes } from './admin/userRoutes.js';
import { accountRoutes } from './accounts/routes.js';
import { adminEventRoutes } from './events/adminRoutes.js';
import { eventRoutes } from './events/routes.js';
import { allow } from './http/access.js';
import { adminInfoRoutes } from './info/adminRoutes.js';
import { infoRoutes } from './info/routes.js';
import { csrfGuard } from './http/csrf.js';
import { errorHandler, sendError } from './http/errors.js';
import { securityHeaders } from './http/securityHeaders.js';
import { currentUser, sessionMiddleware } from './http/session.js';
import { staffTwoFactorGate } from './twofa/gate.js';
import { twoFactorRoutes } from './twofa/routes.js';

export function createApp({ buildInfo, config, db }) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy, req.ip and req.protocol come from its X-Forwarded-* headers.
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders());

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(csrfGuard(config));
  api.use(sessionMiddleware(db, config));
  api.use(currentUser(db));
  api.use(staffTwoFactorGate(db, config));

  api.get('/health', allow('public'), (_req, res) => {
    res.json({ ok: true, version: buildInfo.version, commit: buildInfo.commit });
  });
  api.use('/auth', accountRoutes(db, config));
  api.use('/auth', bootstrapRoutes(db, config));
  api.use('/2fa', twoFactorRoutes(db, config));
  api.use('/admin/users', adminUserRoutes(db, config));
  api.use('/admin/audit', adminAuditRoutes(db));
  api.use('/info', infoRoutes(db));
  api.use('/admin/info', adminInfoRoutes(db));
  api.use('/events', eventRoutes(db));
  api.use('/admin/events', adminEventRoutes(db));

  // Unknown API paths answer JSON, never the HTML page.
  api.use((_req, res) => sendError(res, 404, 'not_found', 'No such API endpoint.'));
  app.use('/api', api);

  // One process in production: the same server hands out the built client.
  if (existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    // Any other GET is a client route (/events, /info/faq, ...): the client decides, and
    // shows its own 404 page for paths it does not know.
    app.get('/{*clientRoute}', allow('public'), (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
