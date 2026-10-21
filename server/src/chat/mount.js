// ============================================================
// File:        mount.js
// Path:        server/src/chat/mount.js
// Project:     Seasonal Entertainment
// Description: The whole chat area behind one call: rooms and messages, unread counters,
//              favourites, the member search, direct messages, moderation, the sticker/GIF library, link
//              previews, members' file uploads, the live WebSocket and the retention job.
//              The rest of the server knows only mountChat() and the handle it returns
//              (docs/CHAT.md, "Server interface").
// ============================================================

import express from 'express';
import { adminMediaRoutes } from '../media/adminRoutes.js';
import { MEDIA_URL_PREFIX, mediaUrl } from '../media/files.js';
import { mediaRoutes } from '../media/routes.js';
import { seedChatMedia } from '../media/seed.js';
import { fetchImage } from '../previews/fetchImage.js';
import { previewModerationRoutes } from '../previews/routes.js';
import { createPreviewService } from '../previews/service.js';
import { uploadRoutes } from '../uploads/routes.js';
import { directReportRoutes } from './directReportRoutes.js';
import { directRoutes } from './directRoutes.js';
import { favouriteRoutes } from './favouriteRoutes.js';
import { memberRoutes } from './memberRoutes.js';
import { ChatHub } from './hub.js';
import { adminChatRoomRoutes, chatModerationRoutes } from './moderationRoutes.js';
import { startChatRetention } from './retention.js';
import { chatRoutes } from './routes.js';
import { seedChatRooms } from './seed.js';
import { ensureGuest } from './guestIdentity.js';
import {
  activeSanction,
  closeRoom,
  createUnlistedRoom,
  findRoom,
  findRoomBySlug,
} from './store.js';
import { chatViewer } from './viewer.js';
import { makeSenderLimit } from './senderLimit.js';
import { attachChatSocket } from './socket.js';
import { unreadRoutes } from './unreadRoutes.js';

// Public media file names: <32 hex>.<ext> at the top (library) or in previews/.
// Library files, link-preview images and the event bot's images (bots/images.js).
const PUBLIC_MEDIA = /^\/(?:previews\/|bot-images\/)?[0-9a-f]{32}\.(?:webp|png|gif|jpg)$/;

// app: the Express app (chat media files are served at /media); api: the /api router, after
// sessions, current user and the 2FA gate; sessionParser: the session middleware, reused on
// the WebSocket upgrade; previewNetwork: how link previews reach the internet (tests replace
// it); embedOrigins: the sites approved for the embedded chat (embed/origins.js), for sockets
// that connect with an embed token. Call before the API's catch-all 404.
export function mountChat({ app, api, db, config, sessionParser, previewNetwork, embedOrigins }) {
  const hub = new ChatHub(db, config, embedOrigins);
  const previews = createPreviewService(db, config, hub, previewNetwork);

  // One per-sender rate limit for room and direct messages alike.
  const allowMessage = makeSenderLimit(config.chat.rate);

  api.use('/chat', chatRoutes(db, config, hub, previews, allowMessage));
  api.use('/chat/favourites', favouriteRoutes(db, hub));
  api.use('/chat', unreadRoutes(db, hub));
  api.use('/chat', memberRoutes(db, config, hub));
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

  // The sticker/GIF library, preview images and event images are public: generated names (an
  // event image's changes with its ?v=), never reused
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
    // For areas that show outside images from this site (the event bot's, bots/images.js):
    // the link previews' guarded image fetch (previews/fetchImage.js) and the public media
    // address of a stored file.
    images: { fetch: fetchImage, url: mediaUrl },
    // For account code: open chat sockets follow logouts and account changes.
    sessions: {
      ended: (sessionId) => hub.disconnectSession(sessionId),
      accountChanged: (userId, keepSessionId) => hub.disconnectUser(userId, keepSessionId),
      // A member showed or hid their online status: open lists reload their presence.
      presenceChanged: () => {
        hub.sendToMembers({ type: 'presence' });
        hub.announceOnline();
      },
      // Embed tokens ended (embed/): { tokenId } | { origin } | { userId } — their sockets close.
      embedRevoked: (which) => hub.disconnectEmbeds(which),
    },
    // For areas with a chat room of their own (a call's chat, calls/): an unlisted room,
    // shown only where a panel names it, closed (read-only for everyone) when it is over.
    rooms: {
      find: (id) => findRoom(db, id),
      findBySlug: (slug) => findRoomBySlug(db, slug),
      createUnlisted: (room) => createUnlistedRoom(db, room),
      close: (id) => closeRoom(db, id),
    },
    // For areas that tell a member something live (call reminders, calls/reminders.js): an
    // event to every open page of that account; returns how many got it.
    notify: { member: (userId, event) => hub.sendToUser(userId, event) },
    // For areas that let chat users in (a call, calls/): who is asking — an account, or a
    // guest with their chat identity (given now if needed; null after answering 503) — and
    // their chat sanction (mute or ban), if any.
    people: {
      identify: async (req, res) => {
        const viewer = chatViewer(req);
        return (await ensureGuest(req, res, viewer, db)) ? viewer : null;
      },
      sanction: (who) => activeSanction(db, who),
    },
    // The live connection, once the HTTP server listens.
    attach: (server) => attachChatSocket(server, { hub, sessionParser, db, config, embedOrigins }),
    // First-start rooms and stickers/GIFs, then the retention job (unless switched off).
    async start(log = console.log) {
      if (seedChatRooms(db)) log('Added the chat rooms (first start)');
      const media = await seedChatMedia(db, config);
      if (media) log(`Added ${media} chat stickers and GIFs (first start)`);
      if (config.backgroundJobs) startChatRetention(db, config, log);
    },
  };
}
