// ============================================================
// File:        routes.js
// Path:        server/src/calls/routes.js
// Project:     Seasonal Entertainment
// Description: /api/calls: the listing and one call for everyone (when calls are configured),
//              a summary for the sidebar's LIVE badge, and management for organisers and
//              admins — create (with its unlisted chat room), start (opens the room on the call
//              service), end (endCall.js: closes that room, which disconnects everyone, and
//              makes the chat read-only). Every management action is audited and rate-limited
//              per account. The listing names a member's reminded calls (reminders.js); a call
//              going live starts a reminder round at once (remindNow). A new call may be linked
//              to an upcoming event bot occurrence (botOccurrenceId; eventLink.js), and one
//              call's answer names that occurrence while it still exists (event).
// ============================================================

import express from 'express';
import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { required, validBody } from '../http/validate.js';
import { getSetting } from '../settings/store.js';
import { reminderCallIds } from './reminders.js';
import { endCall } from './endCall.js';
import { callSteps } from './middleware.js';
import { linkedOccurrence, occurrenceIdField, pickedOccurrence } from './eventLink.js';
import {
  createCall,
  findCall,
  listCalls,
  anyCallLive,
  markLive,
  setCallEvent,
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
  botOccurrenceId: occurrenceIdField,
};

// What the browser sees of a call: never the call service's room name.
export const shown = (call, chat) => {
  const { roomName, chatRoomId, ...rest } = call;
  return { ...rest, chatRoom: chatRoomId ? (chat.rooms.find(chatRoomId)?.slug ?? null) : null };
};

// Organisers and admins with 2FA in order (the gate's mark), as allow('organiser') decides.
const canManage = (req) =>
  Boolean(req.user) && roleAtLeast(req.user.role, 'organiser') && !req.staffRefusal;

// service: the call service (service.js) or null when not configured; chat: mountChat's handle;
// remindNow(): one reminder round (reminders.js), so "is live now" arrives without waiting.
export function callRoutes(db, config, service, chat, remindNow) {
  const router = express.Router();
  const perUser = makeLimiter(config.rateLimits.callManage, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const { configured, loadCall } = callSteps(db, config, service);
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
    // The member's own reminders (the "Remind me" toggles); guests have none.
    const reminders = req.user ? reminderCallIds(db, req.user.id) : [];
    res.json({
      ok: true,
      configured: Boolean(service),
      canManage: canManage(req),
      calls,
      reminders,
    });
  });

  router.get('/:id', allow('public'), configured, loadCall, (req, res) => {
    // The linked bot event's name while it still exists at its start (else no event).
    const event = linkedOccurrence(config, req.call);
    res.json({ ok: true, call: { ...shown(req.call, chat), event }, canManage: canManage(req) });
  });

  router.post('/', allow('organiser'), configured, perUser, (req, res) => {
    const input = validBody(req, res, CALL_FIELDS);
    if (!input) return;
    const occurrence = pickedOccurrence(config, input.botOccurrenceId);
    if (occurrence === undefined) {
      return sendError(res, 400, 'unknown_event', 'Pick one of the upcoming bot events.');
    }
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
      setCallEvent(db, callId, occurrence);
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
    remindNow();
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  router.post('/:id/end', allow('organiser'), configured, loadCall, perUser, async (req, res) => {
    if (!(await endCall(db, service, chat, req.call, req.user))) {
      return sendError(res, 409, 'wrong_status', 'This call has ended already.');
    }
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  return router;
}
