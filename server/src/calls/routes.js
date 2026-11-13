// ============================================================
// File:        routes.js
// Path:        server/src/calls/routes.js
// Project:     Seasonal Entertainment
// Description: /api/calls: the listing and one call for everyone (when calls are configured),
//              a summary for the sidebar's LIVE badge, and management for organisers and
//              admins — create (with its unlisted chat room), start (opens the room on the call
//              service), end (endCall.js: closes that room, which disconnects everyone, and
//              makes the chat read-only); for admins alone, delete an ended call completely
//              (deleteCall.js: the call, its chat and recordings). Every management action is
//              audited and rate-limited per account. The listing names a member's reminded calls (reminders.js); a call
//              going live starts a reminder round and the "has started" web push at once
//              (wentLive). A new call may be linked
//              to an upcoming event bot occurrence (botOccurrenceId; eventLink.js), and one
//              call's answer names that occurrence while it still exists (event). Calls say
//              whether a recording runs (recording) and how far it is (recordingState: starting
//              or active); one call also when its last recording failed to start
//              (recordingFailedAt; recordingRoutes.js, recordingStart.js). A call may be recorded
//              from its start (recordFromStart, offered while recording is set up and allowed:
//              recordingEnabled): starting it starts the recording too (recordingStart.js); a
//              recording that does not start leaves the call running, with the organisers'
//              notice.
// ============================================================

import express from 'express';
import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { callRoomSlug } from '@seasonal-entertainment/shared/callRoom.js';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { required, validBody } from '../http/validate.js';
import { getSetting } from '../settings/store.js';
import { reminderCallIds } from './reminders.js';
import { deleteCall } from './deleteCall.js';
import { endCall } from './endCall.js';
import { callSteps } from './middleware.js';
import { linkedOccurrence, occurrenceIdField, pickedOccurrence } from './eventLink.js';
import {
  activeRecording,
  noteFailedStart,
  recordingFailedAt,
  recordingStates,
  stateOf,
} from './recordings.js';
import { startCallRecording } from './recordingStart.js';
import { publishRoomState } from './roomState.js';
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
  // Record it from its start (decided 2026-11-07); off unless asked for.
  recordFromStart: (v) =>
    v === undefined || typeof v === 'boolean' ? null : 'Record from the start is yes or no.',
};

// What the browser sees of a call: never the call service's room name.
export const shown = (call, chat) => {
  const { roomName, chatRoomId, recordFromStart, ...rest } = call;
  return {
    ...rest,
    recordFromStart: Boolean(recordFromStart),
    chatRoom: chatRoomId ? (chat.rooms.find(chatRoomId)?.slug ?? null) : null,
  };
};

// Organisers and admins with 2FA in order (the gate's mark), as allow('organiser') decides;
// also the recordings archive's (recordingRoutes.js).
export const canManage = (req) =>
  Boolean(req.user) && roleAtLeast(req.user.role, 'organiser') && !req.staffRefusal;

// Admins with 2FA in order: they alone may delete a call (decided 2026-11-04).
export const canDelete = (req) => req.user?.role === 'admin' && !req.staffRefusal;

// Why a call that has not ended cannot be deleted, by its status.
const NOT_ENDED = {
  live: 'End the call first: a live call cannot be deleted.',
  scheduled: 'Cancel the call first: only an ended call can be deleted.',
};

// service: the call service (service.js) or null when not configured; chat: mountChat's handle;
// wentLive(call): what follows a call going live, without waiting and without holding up the
// answer (app.js): a reminder round (reminders.js), so "is live now" arrives at once, and the
// web push "has started" (push/send.js).
export function callRoutes(db, config, service, chat, wentLive) {
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
  // Recording set up and the "Recording allowed" setting on (as the button needs).
  const recordingAllowed = () =>
    Boolean(config.calls?.recording) && getSetting(db, 'calls.recording');
  // A call recorded from its start, as the organiser who starts it. Whatever goes wrong, the
  // call runs on: the organisers see the "did not start" notice instead (docs/CALLS.md).
  async function recordFromStart(req) {
    try {
      await startCallRecording(db, service, req.call, req.user.username, { fromStart: true });
      audit(req, 'call.recording_start', req.call);
    } catch (error) {
      console.error(`[calls] recording of call ${req.call.id} from its start: ${error.message}`);
      noteFailedStart(db, req.call.id);
      // The room was opened a moment ago; if it cannot be told, the call's answer still says it.
      await publishRoomState(db, service, req.call).catch(() => {});
    }
  }

  // Public: whether calls exist at all and whether one is live (the sidebar's badge).
  router.get('/summary', allow('public'), (_req, res) => {
    res.json({ ok: true, configured: Boolean(service), live: Boolean(service) && anyCallLive(db) });
  });

  router.get('/', allow('public'), (req, res) => {
    const empty = { live: [], upcoming: [], recent: [] };
    const lists = service ? listCalls(db) : empty;
    // "Being recorded" (or "Recording starts…") on a call whose recording runs (docs/CALLS.md,
    // "Recording").
    const recorded = recordingStates(db);
    const calls = Object.fromEntries(
      Object.entries(lists).map(([key, list]) => [
        key,
        list.map((c) => ({
          ...shown(c, chat),
          recording: recorded.has(c.id),
          recordingState: recorded.get(c.id) ?? null,
        })),
      ])
    );
    // The member's own reminders (the "Remind me" toggles); guests have none.
    const reminders = req.user ? reminderCallIds(db, req.user.id) : [];
    res.json({
      ok: true,
      configured: Boolean(service),
      canManage: canManage(req),
      canDelete: canDelete(req),
      // The form's "Record from the start": recording set up and allowed.
      recordingEnabled: recordingAllowed(),
      calls,
      reminders,
    });
  });

  router.get('/:id', allow('public'), configured, loadCall, (req, res) => {
    // The linked bot event's name while it still exists at its start (else no event).
    const event = linkedOccurrence(config, req.call);
    // Whether a recording runs, and whether the button shows: recording set up and allowed (a
    // site setting), or one running (so it can always be stopped).
    const running = activeRecording(db, req.call.id);
    const recording = Boolean(running);
    res.json({
      ok: true,
      call: {
        ...shown(req.call, chat),
        event,
        recording,
        recordingState: running ? stateOf(running) : null,
        recordingFailedAt: recordingFailedAt(db, req.call.id),
      },
      canManage: canManage(req),
      canDelete: canDelete(req),
      recordingEnabled:
        Boolean(config.calls?.recording) && (recording || getSetting(db, 'calls.recording')),
    });
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
        slug: callRoomSlug(callId),
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
    wentLive(req.call);
    if (req.call.recordFromStart && recordingAllowed()) await recordFromStart(req);
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  router.post('/:id/end', allow('organiser'), configured, loadCall, perUser, async (req, res) => {
    if (!(await endCall(db, service, chat, req.call, req.user))) {
      return sendError(res, 409, 'wrong_status', 'This call has ended already.');
    }
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  router.delete('/:id', allow('admin'), configured, loadCall, perUser, (req, res) => {
    if (req.call.status !== 'ended') {
      return sendError(res, 409, 'not_ended', NOT_ENDED[req.call.status]);
    }
    // An ended call's recording has stopped (endCall.js); one still running is never cut off.
    if (activeRecording(db, req.call.id)) {
      return sendError(res, 409, 'recording_running', 'A recording of this call is still running.');
    }
    deleteCall(
      db,
      { chat, recordingsDir: config.calls?.recording?.dir ?? null },
      req.call,
      req.user
    );
    res.json({ ok: true });
  });

  return router;
}
