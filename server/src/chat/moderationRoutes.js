// ============================================================
// File:        moderationRoutes.js
// Path:        server/src/chat/moderationRoutes.js
// Project:     Seasonal Entertainment
// Description: Chat moderation (organisers and admins, with 2FA): hide a message (gone for
//              everyone else at once), mute its author for a time, ban its author, list
//              reported messages and active sanctions, lift a sanction. Staff cannot be muted
//              or banned. Every action writes one audit entry. Also the admin room editor.
// ============================================================

import express from 'express';
import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { ROOM_ACCESS } from '@seasonal-entertainment/shared/chatRules.js';
import { findUserById } from '../accounts/userStore.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { required, validBody } from '../http/validate.js';
import {
  addSanction,
  findMessage,
  findRoom,
  hideMessage,
  liftSanction,
  listActiveSanctions,
  listReported,
  listRooms,
  saveRoom,
} from './store.js';

const MUTE_MINUTES = [10, 60, 1440];

export function chatModerationRoutes(db, hub) {
  const router = express.Router();
  const audit = (req, action, targetType, targetId, before, after) =>
    recordAudit(db, req.user, { action, targetType, targetId, before, after });

  router.param('id', (req, res, next, id) => {
    const message = /^\d+$/.test(id) ? findMessage(db, Number(id)) : null;
    if (!message) return sendError(res, 404, 'not_found', 'No such message.');
    req.message = message;
    next();
  });

  router.post('/messages/:id/hide', allow('organiser'), (req, res) => {
    if (!req.message.hiddenAt) {
      hideMessage(db, req.message.id, req.user.username);
      audit(
        req,
        'chat.hide',
        'chat_message',
        req.message.id,
        { author: req.message.author },
        { hidden: true }
      );
      hub.broadcast(req.message.roomId, { type: 'hidden', id: req.message.id });
    }
    res.json({ ok: true });
  });

  // Mute (with minutes) or ban the author of a message. Organisers and admins are exempt.
  const sanction = (kind) => (req, res) => {
    const input = validBody(
      req,
      res,
      kind === 'mute'
        ? {
            minutes: (v) =>
              MUTE_MINUTES.includes(v)
                ? null
                : `Minutes must be one of ${MUTE_MINUTES.join(', ')}.`,
          }
        : {}
    );
    if (!input) return;
    const author = req.message.authorUserId && findUserById(db, req.message.authorUserId);
    if (author && roleAtLeast(author.role, 'organiser')) {
      return sendError(
        res,
        409,
        'staff_exempt',
        'Organisers and admins cannot be muted or banned.'
      );
    }
    const id = addSanction(db, {
      kind,
      message: req.message,
      minutes: input.minutes,
      moderator: req.user.username,
    });
    audit(req, `chat.${kind}`, 'chat_sanction', id, null, {
      target: req.message.author,
      minutes: input.minutes ?? null,
    });
    res.json({ ok: true });
  };
  router.post('/messages/:id/mute', allow('organiser'), sanction('mute'));
  router.post('/messages/:id/ban', allow('organiser'), sanction('ban'));

  router.get('/reports', allow('organiser'), (_req, res) => {
    res.json({ ok: true, messages: listReported(db) });
  });

  router.get('/sanctions', allow('organiser'), (_req, res) => {
    res.json({ ok: true, sanctions: listActiveSanctions(db) });
  });

  router.post('/sanctions/:sanctionId/lift', allow('organiser'), (req, res) => {
    const id = Number(req.params.sanctionId);
    if (!Number.isInteger(id) || !liftSanction(db, id)) {
      return sendError(res, 404, 'not_found', 'No such active sanction.');
    }
    audit(req, 'chat.lift', 'chat_sanction', id, null, { lifted: true });
    res.json({ ok: true });
  });

  return router;
}

// /api/admin/chat/rooms (admins only): list, add and edit rooms.
const ROOM_FIELDS = {
  slug: (v) =>
    typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 40
      ? null
      : 'Slug must be lowercase letters and digits joined by "-".',
  name: required('Name', 40),
  readAccess: (v) =>
    ROOM_ACCESS.includes(v) ? null : `Read access must be one of: ${ROOM_ACCESS.join(', ')}.`,
  writeAccess: (v) =>
    ROOM_ACCESS.includes(v) ? null : `Write access must be one of: ${ROOM_ACCESS.join(', ')}.`,
};

export function adminChatRoomRoutes(db) {
  const router = express.Router();
  const audit = (req, action, id, before, after) =>
    recordAudit(db, req.user, { action, targetType: 'chat_room', targetId: id, before, after });
  const save = (req, res, id) => {
    const input = validBody(req, res, ROOM_FIELDS);
    if (!input) return;
    try {
      const before = id === undefined ? null : findRoom(db, id);
      const room = saveRoom(db, input, id);
      audit(req, id === undefined ? 'chat.room_create' : 'chat.room_edit', room.id, before, input);
      res.status(id === undefined ? 201 : 200).json({ ok: true, room });
    } catch (err) {
      if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
      sendError(res, 409, 'slug_taken', 'Another room has this slug.');
    }
  };

  router.get('/', allow('admin'), (_req, res) => res.json({ ok: true, rooms: listRooms(db) }));
  router.post('/', allow('admin'), (req, res) => save(req, res));
  router.put('/:id', allow('admin'), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !findRoom(db, id)) {
      return sendError(res, 404, 'not_found', 'No such room.');
    }
    save(req, res, id);
  });
  return router;
}
