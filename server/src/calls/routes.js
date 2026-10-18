// ============================================================
// File:        routes.js
// Path:        server/src/calls/routes.js
// Project:     Seasonal Entertainment
// Description: /api/calls: the listing and one call for everyone (when calls are configured),
//              a summary for the sidebar's LIVE badge, and management for organisers and
//              admins — create (with its unlisted chat room), start (opens the room on the call
//              service), end (closes that room, which disconnects everyone, and makes the chat
//              read-only). Every management action is audited and rate-limited per account.
// ============================================================

import express from 'express';
import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { makeLimiter } from '../http/rateLimit.js';
import { required, validBody } from '../http/validate.js';
import { getSetting } from '../settings/store.js';
import {
  createCall,
  findCall,
  listCalls,
  anyCallLive,
  markEnded,
  markLive,
  setChatRoom,
} from './store.js';

const CALL_FIELDS = {
  title: required('Title', 100),
  description: (v) =>
    v === undefined || (typeof v === 'string' && v.length <= 1000)
      ? null
      : 'Description must be text of at most 1000 characters.',
  // A planned start, ISO 8601 with a time zone (the browser sends toISOString()).
  scheduledFor: (v) =>
    v === undefined || v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)))
      ? null
      : 'Planned start must be a date and time.',
};

// What the browser sees of a call: never the call service's room name.
const shown = (call, chat) => {
  const { roomName, chatRoomId, ...rest } = call;
  return { ...rest, chatRoom: chatRoomId ? (chat.rooms.find(chatRoomId)?.slug ?? null) : null };
};

// Organisers and admins with 2FA in order (the gate's mark), as allow('organiser') decides.
const canManage = (req) =>
  Boolean(req.user) && roleAtLeast(req.user.role, 'organiser') && !req.staffRefusal;

// service: the call service (service.js) or null when not configured; chat: mountChat's handle.
export function callRoutes(db, config, service, chat) {
  const router = express.Router();
  const perUser = makeLimiter(config.rateLimits.callManage, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const loadCall = loadById((id) => findCall(db, id), 'call', 'call');
  const configured = (_req, res, next) =>
    service ? next() : sendError(res, 503, 'calls_not_configured', 'Calls are not set up.');
  const audit = (req, action, call) =>
    recordAudit(db, req.user, {
      action,
      targetType: 'call',
      targetId: call.id,
      after: { title: call.title },
    });

  // Public: whether calls exist at all and whether one is live (the sidebar's badge).
  router.get('/summary', allow('public'), (_req, res) => {
    res.json({ ok: true, configured: Boolean(service), live: Boolean(service) && anyCallLive(db) });
  });

  router.get('/', allow('public'), (req, res) => {
    const empty = { live: [], upcoming: [], recent: [] };
    const lists = service ? listCalls(db) : empty;
    const calls = Object.fromEntries(
      Object.entries(lists).map(([key, list]) => [key, list.map((c) => shown(c, chat))])
    );
    res.json({ ok: true, configured: Boolean(service), canManage: canManage(req), calls });
  });

  router.get('/:id', allow('public'), configured, loadCall, (req, res) => {
    res.json({ ok: true, call: shown(req.call, chat), canManage: canManage(req) });
  });

  router.post('/', allow('organiser'), configured, perUser, (req, res) => {
    const input = validBody(req, res, CALL_FIELDS);
    if (!input) return;
    // Guests may write in the call's chat when they may in General (decided 2026-10-18).
    const general = chat.rooms.findBySlug('general');
    const id = db.transaction(() => {
      const callId = createCall(db, input, req.user.id);
      const room = chat.rooms.createUnlisted({
        slug: `call-${callId}`,
        name: `Call: ${input.title}`.slice(0, 40),
        readAccess: 'everyone',
        writeAccess: 'everyone',
        guestWritable: Boolean(general?.guestWritable),
      });
      setChatRoom(db, callId, room.id);
      return callId;
    })();
    const call = findCall(db, id);
    audit(req, 'call.create', call);
    res.status(201).json({ ok: true, call: shown(call, chat) });
  });

  router.post('/:id/start', allow('organiser'), configured, loadCall, perUser, async (req, res) => {
    if (req.call.status !== 'scheduled') {
      return sendError(res, 409, 'wrong_status', 'Only a scheduled call can be started.');
    }
    await service.openRoom(req.call.roomName, getSetting(db, 'calls.maxParticipants'));
    if (!markLive(db, req.call.id)) {
      return sendError(res, 409, 'wrong_status', 'Only a scheduled call can be started.');
    }
    audit(req, 'call.start', req.call);
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  router.post('/:id/end', allow('organiser'), configured, loadCall, perUser, async (req, res) => {
    if (!markEnded(db, req.call.id)) {
      return sendError(res, 409, 'wrong_status', 'This call has ended already.');
    }
    // After the status change: nobody can join any more while the room closes.
    await service.closeRoom(req.call.roomName);
    if (req.call.chatRoomId) chat.rooms.close(req.call.chatRoomId);
    audit(req, 'call.end', req.call);
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  return router;
}
