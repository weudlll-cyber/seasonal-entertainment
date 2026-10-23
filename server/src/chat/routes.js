// ============================================================
// File:        routes.js
// Path:        server/src/chat/routes.js
// Project:     Seasonal Entertainment
// Description: /api/chat for everyone (guests included): the rooms this viewer may read,
//              a room's recent messages (or, with ?after=<id>, those newer than that id: the
//              catch-up after a live connection subscribed), sending (room write access, what
//              may be sent: messageInput.js; mute/ban, per-sender rate limit, per-IP limits
//              for guests; a guest gets a unique guest name on the first message or report),
//              and reporting
//              a message (its preview then shows to moderators only until reviewed); the glimpse
//              of the public room "general" for the home page's Community box (how many members
//              are shown online, only the number, and its newest messages).
//              New messages are pushed live; a member's first https link gets a preview
//              card (previews/); each mentioned member's pages hear a "mention" event (for a
//              browser notification, the start of the text only).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { queryId } from '../http/validate.js';
import { addMessage, findMessage, listMessages } from './messages.js';
import { storeMentions, withMentions } from './mentions.js';
import { readMessageInput } from './messageInput.js';
import { roomLoader } from './roomLoader.js';
import { ensureGuest } from './guestIdentity.js';
import { refuseSanctioned } from './sanctionRefusal.js';
import { activeSanction, findRoom, findRoomBySlug, listRooms, reportMessage } from './store.js';
import { canRead, canWrite, chatViewer, isModerator } from './viewer.js';

// Per-IP limits that apply to guests only: members are limited per account, and people
// behind one address must not slow each other down. newGuestsOnly: only requests that would
// hand out a new guest name count.
const forGuests =
  (limiter, { newGuestsOnly = false } = {}) =>
  (req, res, next) => {
    const known = req.embedSite ? req.embedGuest : req.session?.chatGuest;
    const counted = !req.user && !(newGuestsOnly && known);
    return counted ? limiter(req, res, next) : next();
  };

// previews: the link-preview service (previews/service.js); allowMessage: the per-sender
// rate limit, shared with direct messages (senderLimit.js, mount.js).
// The Community box's room and how many of its newest messages it shows.
const GLIMPSE_ROOM = 'general';
const GLIMPSE_COUNT = 3;
// A mention's notification shows at most this much of the message (docs/CHAT.md).
const MENTION_TEXT_MAX = 80;

export function chatRoutes(db, config, hub, previews, allowMessage) {
  const router = express.Router();
  const guestPostsPerIp = forGuests(makeLimiter(config.rateLimits.chatGuestPost));
  const newGuestsPerIp = forGuests(makeLimiter(config.rateLimits.chatNewGuest), {
    newGuestsOnly: true,
  });

  const loadRoom = roomLoader(db);

  // The home page's Community box, for everyone: the number of members shown online
  // (hub.onlineUserIds: their own setting respected) and the newest messages of "general" —
  // only while everyone may read that room, never a hidden message (not even for moderators).
  router.get('/glimpse', allow('public'), (_req, res) => {
    const general = findRoomBySlug(db, GLIMPSE_ROOM);
    const open = general?.readAccess === 'everyone';
    const messages = open ? listMessages(db, general, { limit: GLIMPSE_COUNT }) : [];
    res.json({
      ok: true,
      online: hub.onlineUserIds().size,
      room: open ? GLIMPSE_ROOM : null,
      messages,
    });
  });

  // ?include=<slug>: also an unlisted room (a call's chat) when this viewer may read it.
  router.get('/rooms', allow('public'), (req, res) => {
    const viewer = chatViewer(req);
    const include = typeof req.query.include === 'string' ? req.query.include : null;
    const rooms = listRooms(db, { include })
      .filter((room) => canRead(room, viewer))
      .map(({ slug, name, ...room }) => ({ slug, name, canWrite: canWrite(room, viewer) }));
    res.json({
      ok: true,
      rooms,
      me: { guestName: viewer.guest?.name ?? null, moderator: isModerator(viewer) },
    });
  });

  router.get('/rooms/:slug/messages', allow('public'), loadRoom, (req, res) => {
    const moderator = isModerator(chatViewer(req));
    const afterId = queryId(req.query.after);
    const messages = listMessages(db, req.room, { moderator, afterId });
    res.json({ ok: true, messages: withMentions(db, messages) });
  });

  router.post(
    '/rooms/:slug/messages',
    allow('public'),
    loadRoom,
    guestPostsPerIp,
    newGuestsPerIp,
    async (req, res) => {
      const viewer = chatViewer(req);
      if (!canWrite(req.room, viewer)) {
        return sendError(res, 403, 'read_only', 'You cannot write in this room.');
      }
      const input = readMessageInput(req, res, db, viewer);
      if (!input) return;
      const sanction = activeSanction(db, viewer);
      if (sanction) return refuseSanctioned(res, sanction);
      if (!(await ensureGuest(req, res, viewer, db))) return;
      const senderKey = viewer.user ? `user:${viewer.user.id}` : `guest:${viewer.guest.id}`;
      if (!allowMessage(senderKey, !viewer.user)) {
        return sendError(res, 429, 'too_many_messages', 'You are sending messages too fast.');
      }
      // Stickers and GIFs count like text towards the sender's rate limit.
      const message = addMessage(db, req.room, viewer, input);
      // Guests may type "@name" too: it notifies only a member who may read the room.
      const mentioned = storeMentions(db, config, req.room, message, input.body ?? '');
      // Internal ids stay on the server; readers get only what the room shows.
      const { roomId, authorUserId, authorGuest, ...rest } = message;
      const [visible] = withMentions(db, [rest]);
      hub.broadcast(req.room.id, { type: 'message', message: visible });
      // Each mentioned member's own pages, for a browser notification (docs/CHAT.md,
      // "Notifications"): who, where, and the start of what they wrote.
      for (const userId of mentioned) {
        hub.sendToUser(userId, {
          type: 'mention',
          id: visible.id,
          room: req.room.slug,
          roomName: req.room.name,
          author: visible.author,
          text: (input.body ?? '').slice(0, MENTION_TEXT_MAX),
        });
      }
      // Every member who may read the room recounts their unread messages (other tabs too).
      hub.notifyReaders(req.room, { type: 'activity', room: req.room.slug });
      res.status(201).json({ ok: true, message: visible });
      previews.attach(message, viewer); // in the background; pushed when ready
    }
  );

  router.post(
    '/messages/:id/report',
    allow('public'),
    makeLimiter(config.rateLimits.chatReport),
    newGuestsPerIp,
    async (req, res) => {
      const viewer = chatViewer(req);
      const message = /^\d+$/.test(req.params.id) ? findMessage(db, Number(req.params.id)) : null;
      const room = message && findRoom(db, message.roomId);
      if (!room || !canRead(room, viewer) || message.hiddenAt) {
        return sendError(res, 404, 'not_found', 'No such message.');
      }
      // Counted once per account or guest; no IP address is stored.
      if (!(await ensureGuest(req, res, viewer, db))) return;
      const reporter = viewer.user ? `user:${viewer.user.id}` : `guest:${viewer.guest.id}`;
      reportMessage(db, message.id, reporter);
      // Until a moderator reviews it, only moderators see its preview.
      if (message.preview) hub.broadcast(room.id, { type: 'previewHidden', id: message.id });
      res.json({ ok: true });
    }
  );

  return router;
}
