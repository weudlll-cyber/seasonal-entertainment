// ============================================================
// File:        routes.js
// Path:        server/src/chat/routes.js
// Project:     Seasonal Entertainment
// Description: /api/chat for everyone (guests included): the rooms this viewer may read,
//              a room's recent messages, sending (room write access, length, no links from
//              guests, mute/ban, per-sender rate limit; a guest gets a unique guest name on
//              the first message or report), and reporting a message. New messages are pushed
//              live.
// ============================================================

import express from 'express';
import { containsLink, validateMessage } from '@seasonal-entertainment/shared/chatRules.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { makeSenderLimit } from './senderLimit.js';
import {
  activeSanction,
  addMessage,
  assignGuestName,
  findMessage,
  findRoom,
  findRoomBySlug,
  listMessages,
  listRooms,
  reportMessage,
  touchGuest,
} from './store.js';
import { canRead, canWrite, chatViewer, isModerator } from './viewer.js';

const saveSession = (req) =>
  new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));

// A guest's first message (or report) gives them a name nobody else holds, kept in the
// session; later ones mark it as still in use.
async function ensureGuest(req, viewer, db) {
  if (viewer.user) return;
  if (viewer.guest) return touchGuest(db, viewer.guest.id);
  viewer.guest = assignGuestName(db);
  req.session.chatGuest = viewer.guest;
  await saveSession(req);
}

export function chatRoutes(db, config, hub) {
  const router = express.Router();
  const allowMessage = makeSenderLimit(config.chat.rate);

  // Unknown and unreadable rooms answer the same 404: a room's existence is not revealed.
  router.param('slug', (req, res, next, slug) => {
    const room = findRoomBySlug(db, slug);
    if (!room || !canRead(room, chatViewer(req))) {
      return sendError(res, 404, 'not_found', 'No such room.');
    }
    req.room = room;
    next();
  });

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

  router.get('/rooms/:slug/messages', allow('public'), (req, res) => {
    const includeHidden = isModerator(chatViewer(req));
    res.json({ ok: true, messages: listMessages(db, req.room, { includeHidden }) });
  });

  router.post('/rooms/:slug/messages', allow('public'), async (req, res) => {
    const viewer = chatViewer(req);
    if (!canWrite(req.room, viewer)) {
      return sendError(res, 403, 'read_only', 'You cannot write in this room.');
    }
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : req.body?.body;
    const problem = validateMessage(body);
    if (problem) return sendError(res, 400, 'invalid_input', problem);
    if (!viewer.user && containsLink(body)) {
      return sendError(
        res,
        400,
        'links_not_allowed',
        'Guests cannot post links. Register to share links.'
      );
    }
    const sanction = activeSanction(db, viewer);
    if (sanction) {
      const until = sanction.until
        ? ` until ${sanction.until.slice(0, 16).replace('T', ' ')} UTC`
        : '';
      return sendError(
        res,
        403,
        sanction.kind === 'ban' ? 'banned' : 'muted',
        `You are ${sanction.kind === 'ban' ? 'banned from' : 'muted in'} the chat${until}.`
      );
    }
    await ensureGuest(req, viewer, db);
    const senderKey = viewer.user ? `user:${viewer.user.id}` : `guest:${viewer.guest.id}`;
    if (!allowMessage(senderKey, !viewer.user)) {
      return sendError(res, 429, 'too_many_messages', 'You are sending messages too fast.');
    }
    const message = addMessage(db, req.room, viewer, body);
    // Internal ids stay on the server; readers get only what the room shows.
    const { roomId, authorUserId, authorGuest, ...visible } = message;
    hub.broadcast(req.room.id, { type: 'message', message: visible });
    res.status(201).json({ ok: true, message: visible });
  });

  router.post(
    '/messages/:id/report',
    allow('public'),
    makeLimiter(config.rateLimits.chatReport),
    async (req, res) => {
      const viewer = chatViewer(req);
      const message = /^\d+$/.test(req.params.id) ? findMessage(db, Number(req.params.id)) : null;
      const room = message && findRoom(db, message.roomId);
      if (!room || !canRead(room, viewer) || message.hiddenAt) {
        return sendError(res, 404, 'not_found', 'No such message.');
      }
      // Counted once per account or guest; no IP address is stored.
      await ensureGuest(req, viewer, db);
      const reporter = viewer.user ? `user:${viewer.user.id}` : `guest:${viewer.guest.id}`;
      reportMessage(db, message.id, reporter);
      res.json({ ok: true });
    }
  );

  return router;
}
