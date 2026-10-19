// ============================================================
// File:        app.js
// Path:        server/src/app.js
// Project:     Seasonal Entertainment
// Description: Builds the Express app: security headers, CSRF origin check, sessions, the
//              JSON API under /api (the chat area through mountChat; calls, docs/CALLS.md,
//              with the call service built from config) and, when a built client
//              exists, the static client with a fallback to index.html for client routes. No
//              listen(), so tests drive it directly; app.locals.chat is the chat's handle,
//              app.locals.calls.start() starts the stale-call job (calls/staleCalls.js).
//              The embedded chat on approved foreign sites (embed/) adds its CSP, its token
//              check and its routes.
// ============================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { bootstrapRoutes } from './accounts/bootstrap.js';
import { adminAuditRoutes } from './admin/auditRoutes.js';
import { callJoinRoutes } from './calls/joinRoutes.js';
import { callRoutes } from './calls/routes.js';
import { callSpotlightRoutes } from './calls/spotlightRoutes.js';
import { callStageRoutes } from './calls/stageRoutes.js';
import { createCallService } from './calls/service.js';
import { startStaleCalls } from './calls/staleCalls.js';
import { mountChat } from './chat/mount.js';
import { adminEmbedRoutes } from './embed/adminRoutes.js';
import { embedTokenAuth } from './embed/auth.js';
import { createEmbedOrigins } from './embed/origins.js';
import { embedRoutes } from './embed/routes.js';
import { adminUserRoutes } from './admin/userRoutes.js';
import { accountRoutes } from './accounts/routes.js';
import { adminEventRoutes } from './events/adminRoutes.js';
import { eventRoutes } from './events/routes.js';
import { adminGameRoutes } from './games/adminRoutes.js';
import { gameRoutes } from './games/routes.js';
import { allow } from './http/access.js';
import { adminInfoRoutes } from './info/adminRoutes.js';
import { infoRoutes } from './info/routes.js';
import { keyRoutes } from './keys/routes.js';
import { csrfGuard } from './http/csrf.js';
import { errorHandler, sendError } from './http/errors.js';
import { securityHeaders } from './http/securityHeaders.js';
import { currentUser, sessionMiddleware } from './http/session.js';
import { adminSettingRoutes } from './settings/adminRoutes.js';
import { staffTwoFactorGate } from './twofa/gate.js';
import { twoFactorRoutes } from './twofa/routes.js';

// previewNetwork: how link previews reach the internet (tests replace it); callService: the
// call service (calls/service.js; tests hand in a stand-in), built from config by default.
export function createApp({
  buildInfo,
  config,
  db,
  previewNetwork,
  callService = createCallService(config.calls),
}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy, req.ip and req.protocol come from its X-Forwarded-* headers.
  app.set('trust proxy', config.trustProxy);
  // The foreign sites approved for the embedded chat: its CSP, tokens and sockets (embed/).
  const embedOrigins = createEmbedOrigins(db);
  app.use(securityHeaders(config, embedOrigins));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(csrfGuard(config));
  // One session middleware for HTTP and the chat WebSocket upgrade.
  const sessions = sessionMiddleware(db, config);
  api.use(sessions);
  api.use(currentUser(db));
  // An embed token (the chat on an approved foreign site) acts on the chat routes only.
  api.use(embedTokenAuth(db, embedOrigins));
  api.use(staffTwoFactorGate(db, config));

  // The whole chat area (docs/CHAT.md). Its handle: index.js attaches the socket and starts
  // it; account routes tell it about ended sessions and changed accounts.
  const chat = mountChat({
    app,
    api,
    db,
    config,
    sessionParser: sessions,
    previewNetwork,
    embedOrigins,
  });
  app.locals.chat = chat;

  api.get('/health', allow('public'), (_req, res) => {
    res.json({ ok: true, version: buildInfo.version, commit: buildInfo.commit });
  });
  api.use('/auth', accountRoutes(db, config, chat.sessions));
  api.use('/auth', bootstrapRoutes(db, config));
  api.use('/2fa', twoFactorRoutes(db, config, chat.sessions));
  api.use('/keys', keyRoutes(db, config));
  api.use('/admin/users', adminUserRoutes(db, config, chat.sessions));
  api.use('/admin/audit', adminAuditRoutes(db));
  api.use('/info', infoRoutes(db));
  api.use('/admin/info', adminInfoRoutes(db));
  api.use('/events', eventRoutes(db));
  api.use('/admin/events', adminEventRoutes(db));
  api.use('/games', gameRoutes(db));
  api.use('/admin/games', adminGameRoutes(db));
  api.use('/admin/settings', adminSettingRoutes(db));
  api.use('/embed', embedRoutes(db, config, embedOrigins, chat.sessions));
  api.use('/admin/embed-origins', adminEmbedRoutes(db, config, embedOrigins, chat.sessions));
  api.use('/calls', callRoutes(db, config, callService, chat));
  api.use('/calls', callJoinRoutes(db, config, callService, chat));
  api.use('/calls', callStageRoutes(db, config, callService, chat));
  api.use('/calls', callSpotlightRoutes(db, config, callService));
  app.locals.calls = { start: (log) => startStaleCalls(db, config, callService, chat, log) };

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
