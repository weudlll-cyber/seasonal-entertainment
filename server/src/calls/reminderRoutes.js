// ============================================================
// File:        reminderRoutes.js
// Path:        server/src/calls/reminderRoutes.js
// Project:     Seasonal Entertainment
// Description: Around one planned call (docs/CALLS.md): its calendar file for everyone,
//              guests included (GET /api/calls/:id/calendar.ics, calendar.js; rate-limited per
//              address like the other public reads), and a member's "Remind me on this site"
//              (PUT and DELETE /api/calls/:id/reminder; reminders.js). Calls are visible to
//              everyone (as GET /api/calls), so these need no further rule.
// ============================================================

import express from 'express';
import { selfOrigin } from '../http/csrf.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { callCalendar } from './calendar.js';
import { callSteps } from './middleware.js';
import { removeReminder, setReminder } from './reminders.js';

export function callReminderRoutes(db, config, service) {
  const router = express.Router();
  const { configured, loadCall } = callSteps(db, config, service);
  const calendarsPerIp = makeLimiter(config.rateLimits.callCalendar);
  const perMember = makeLimiter(config.rateLimits.callAction, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  // Only a call still to come, with a planned time, has something to put in a calendar.
  const planned = (req, res, next) =>
    req.call.status === 'scheduled' && req.call.scheduledFor
      ? next()
      : sendError(res, 409, 'not_planned', 'This call has no planned time to come.');

  router.get(
    '/:id/calendar.ics',
    allow('public'),
    calendarsPerIp,
    configured,
    loadCall,
    planned,
    (req, res) => {
      res.type('text/calendar; charset=utf-8');
      res.attachment(`seasonal-call-${req.call.id}.ics`);
      res.send(callCalendar(req.call, selfOrigin(req, config)));
    }
  );

  // A reminder only for a call that has not ended (it would be removed at once).
  router.put('/:id/reminder', allow('member'), perMember, configured, loadCall, (req, res) => {
    if (req.call.status === 'ended') {
      return sendError(res, 410, 'call_ended', 'This call has ended.');
    }
    setReminder(db, req.user.id, req.call.id);
    res.json({ ok: true, reminder: true });
  });

  router.delete('/:id/reminder', allow('member'), perMember, configured, loadCall, (req, res) => {
    removeReminder(db, req.user.id, req.call.id);
    res.json({ ok: true, reminder: false });
  });

  return router;
}
