// ============================================================
// File:        routes.js
// Path:        server/src/chat/routes.js
// Project:     Seasonal Entertainment
// Description: /api/chat for everyone (guests included): the rooms this viewer may read,
//              a room's recent messages, sending (room write access, what may be sent:
//              messageInput.js; mute/ban, per-sender rate limit, per-IP limits for guests; a
//              guest gets a unique guest name on the first message or report), and reporting
//              a message (its preview then shows to moderators only until reviewed).
//              New messages are pushed live; a member's first https link gets a preview
//              card (previews/).
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { addMessage, findMessage, listMessages } from './messages.js';
import { storeMentions, withMentions } from './mentions.js';
import { readMessageInput } from './messageInput.js';
import { roomLoader } from './roomLoader.js';
import { refuseSanctioned } from './sanctionRefusal.js';
import {
  activeSanction,
  assignGuestName,
  findRoom,
  listRooms,
  reportMessage,
  touchGuest,
} from './store.js';
import { canRead, canWrite, chatViewer, isModerator } from './viewer.js';

const saveSession = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

// A guest's first message (or report) gives them a name nobody else holds, kept in the
// session; later ones mark it as still in use. false (after answering 503) if no name is free.
async function ensureGuest(req, res, viewer, db) {
  if (viewer.user) return true;
  if (viewer.guest) {
    touchGuest(db, viewer.guest.id);
    return true;
  }
  viewer.guest = assignGuestName(db);
  if (!viewer.guest) {
    sendError(res, 503, 'guest_names_exhausted', 'Guest chat is full right now. Please log in.');
    return false;
  }
  req.session.chatGuest = viewer.guest;
  await saveSession(req);
  return true;
}

// Per-IP limits that apply to guests only: members are limited per account, and people
// behind one address must not slow each other down. newGuestsOnly: only requests that would
// hand out a new guest name count.
const forGuests =
  (limiter, { newGuestsOnly = false } = {}) =>
  (req, res, next) => {
    const counted = !req.user && !(newGuestsOnly && req.session?.chatGuest);
    return counted ? limiter(req, res, next) : next();
  };

// previews: the link-preview service (previews/service.js); allowMessage: the per-sender
// rate limit, shared with direct messages (senderLimit.js, mount.js).
export function chatRoutes(db, config, hub, previews, allowMessage) {
  const router = express.Router();
  const guestPostsPerIp = forGuests(makeLimiter(config.rateLimits.chatGuestPost));
  const newGuestsPerIp = forGuests(makeLimiter(config.rateLimits.chatNewGuest), {
    newGuestsOnly: true,
  });

  const loadRoom = roomLoader(db);

  router.get('/rooms', allow('public'), (req, res) => {
    const viewer = chatViewer(req);
    const rooms = listRooms(db)
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
    res.json({ ok: true, messages: withMentions(db, listMessages(db, req.room, { moderator })) });
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
      storeMentions(db, config, req.room, message, input.body ?? '');
      // Internal ids stay on the server; readers get only what the room shows.
      const { roomId, authorUserId, authorGuest, ...rest } = message;
      const [visible] = withMentions(db, [rest]);
      hub.broadcast(req.room.id, { type: 'message', message: visible });
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
