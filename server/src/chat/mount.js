// ============================================================
// File:        mount.js
// Path:        server/src/chat/mount.js
// Project:     Seasonal Entertainment
// Description: The whole chat area behind one call: rooms and messages, favourites, direct
//              messages, moderation, the sticker/GIF library, link previews, members' file
//              uploads, the live WebSocket and the retention job.
//              The rest of the server knows only mountChat() and the handle it returns
//              (docs/CHAT.md, "Server interface").
// ============================================================

import express from 'express';
import { adminMediaRoutes } from '../media/adminRoutes.js';
import { MEDIA_URL_PREFIX } from '../media/files.js';
import { mediaRoutes } from '../media/routes.js';
import { seedChatMedia } from '../media/seed.js';
import { previewModerationRoutes } from '../previews/routes.js';
import { createPreviewService } from '../previews/service.js';
import { uploadRoutes } from '../uploads/routes.js';
import { directReportRoutes } from './directReportRoutes.js';
import { directRoutes } from './directRoutes.js';
import { favouriteRoutes } from './favouriteRoutes.js';
import { ChatHub } from './hub.js';
import { adminChatRoomRoutes, chatModerationRoutes } from './moderationRoutes.js';
import { startChatRetention } from './retention.js';
import { chatRoutes } from './routes.js';
import { seedChatRooms } from './seed.js';
import { makeSenderLimit } from './senderLimit.js';
import { attachChatSocket } from './socket.js';

// Public media file names: <32 hex>.<ext> at the top (library) or in previews/.
const PUBLIC_MEDIA = /^\/(?:previews\/)?[0-9a-f]{32}\.(?:webp|png|gif|jpg)$/;

// app: the Express app (chat media files are served at /media); api: the /api router, after
// sessions, current user and the 2FA gate; sessionParser: the session middleware, reused on
// the WebSocket upgrade; previewNetwork: how link previews reach the internet (tests replace
// it). Call before the API's catch-all 404.
export function mountChat({ app, api, db, config, sessionParser, previewNetwork }) {
  const hub = new ChatHub(db, config);
  const previews = createPreviewService(db, config, hub, previewNetwork);

  // One per-sender rate limit for room and direct messages alike.
  const allowMessage = makeSenderLimit(config.chat.rate);

  api.use('/chat', chatRoutes(db, config, hub, previews, allowMessage));
  api.use('/chat/favourites', favouriteRoutes(db, hub));
  api.use('/chat/direct', directRoutes(db, hub, allowMessage));
  const reports = directReportRoutes(db, config);
  api.use('/chat/direct', reports.member);
  api.use('/chat/direct-reports', reports.moderator);
  api.use('/chat', previewModerationRoutes(db, hub));
  api.use('/chat', chatModerationRoutes(db, hub));
  api.use('/chat', mediaRoutes(db));
  api.use('/chat', uploadRoutes(db, config, hub));
  api.use('/admin/chat/rooms', adminChatRoomRoutes(db));
  api.use('/admin/chat/media', adminMediaRoutes(db, config));

  // The sticker/GIF library and preview images are public: generated names, never reused
  // (immutable cache); the type follows the checked extension, helmet adds nosniff. Only those
  // exact names are served: members' uploads share the media folder (uploads/) but are never
  // public, and anything else (other paths, "..", encodings) answers 404, never the client page.
  app.use(
    MEDIA_URL_PREFIX,
    (req, res, next) => (PUBLIC_MEDIA.test(req.path) ? next() : res.status(404).end()),
    express.static(config.mediaDir, { immutable: true, maxAge: '365d', index: false }),
    (_req, res) => res.status(404).end()
  );

  return {
    // For account code: open chat sockets follow logouts and account changes.
    sessions: {
      ended: (sessionId) => hub.disconnectSession(sessionId),
      accountChanged: (userId, keepSessionId) => hub.disconnectUser(userId, keepSessionId),
    },
    // The live connection, once the HTTP server listens.
    attach: (server) => attachChatSocket(server, { hub, sessionParser, db, config }),
    // First-start rooms and stickers/GIFs, then the retention job (unless switched off).
    async start(log = console.log) {
      if (seedChatRooms(db)) log('Added the chat rooms (first start)');
      const media = await seedChatMedia(db, config);
      if (media) log(`Added ${media} chat stickers and GIFs (first start)`);
      if (config.backgroundJobs) startChatRetention(db, config, log);
    },
  };
}
