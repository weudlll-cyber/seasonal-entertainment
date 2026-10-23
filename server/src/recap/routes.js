// ============================================================
// File:        routes.js
// Path:        server/src/recap/routes.js
// Project:     Seasonal Entertainment
// Description: POST /api/admin/recap (admins only): "Post recap now", for trying the weekly
//              recap out (docs/CHAT.md, "Weekly recap"). Posts it at once as the site
//              (job.js), audited; it does not count as the week's, so Monday's still comes.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { postRecap } from './job.js';

// deps: as job.js's postRecap.
export function adminRecapRoutes(deps) {
  const router = express.Router();
  router.post('/', allow('admin'), (req, res) => {
    const message = postRecap(deps);
    if (!message) {
      return sendError(res, 409, 'no_room', 'Neither "announcements" nor "general" exists.');
    }
    recordAudit(deps.db, req.user, {
      action: 'recap.post',
      targetType: 'chat_message',
      targetId: message.id,
      before: null,
      after: { room: message.room },
    });
    res.status(201).json({ ok: true, message: { id: message.id, room: message.room } });
  });
  return router;
}
