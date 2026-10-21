// ============================================================
// File:        eventRoutes.js
// Path:        server/src/calls/eventRoutes.js
// Project:     Seasonal Entertainment
// Description: Linking calls to the event bot's occurrences (docs/CALLS.md, "Linked to a bot
//              event"), organisers and admins only: GET /api/calls/bot-occurrences (the next
//              30 days, for the picker) and PUT /api/calls/:id/event { botOccurrenceId | null }
//              for a planned call. Audited and rate-limited per account like the other
//              management actions. Mounted before routes.js, whose /:id would take the path.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { validBody } from '../http/validate.js';
import { occurrenceIdField, pickedOccurrence, upcomingOccurrences } from './eventLink.js';
import { callSteps } from './middleware.js';
import { shown } from './routes.js';
import { findCall, setCallEvent } from './store.js';

// chat: mountChat's handle (the call's chat room slug in the answer, as routes.js shows it).
export function callEventRoutes(db, config, service, chat) {
  const router = express.Router();
  const perUser = makeLimiter(config.rateLimits.callManage, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });
  const { configured, loadCall } = callSteps(db, config, service);

  router.get('/bot-occurrences', allow('organiser'), configured, (_req, res) => {
    res.json({ ok: true, occurrences: upcomingOccurrences(config) });
  });

  router.put('/:id/event', allow('organiser'), configured, loadCall, perUser, (req, res) => {
    const input = validBody(req, res, { botOccurrenceId: occurrenceIdField });
    if (!input) return;
    if (req.call.status !== 'scheduled') {
      return sendError(res, 409, 'wrong_status', 'Only a planned call can be linked to an event.');
    }
    const occurrence = pickedOccurrence(config, input.botOccurrenceId);
    if (occurrence === undefined) {
      return sendError(res, 400, 'unknown_event', 'Pick one of the upcoming bot events.');
    }
    setCallEvent(db, req.call.id, occurrence);
    recordAudit(db, req.user, {
      action: 'call.event',
      targetType: 'call',
      targetId: req.call.id,
      after: { title: req.call.title, botOccurrenceId: occurrence?.id ?? null },
    });
    res.json({ ok: true, call: shown(findCall(db, req.call.id), chat) });
  });

  return router;
}
