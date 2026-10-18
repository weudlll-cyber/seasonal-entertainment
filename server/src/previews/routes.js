// ============================================================
// File:        routes.js
// Path:        server/src/previews/routes.js
// Project:     Seasonal Entertainment
// Description: POST /api/chat/messages/:id/preview/remove (organisers and admins, with 2FA):
//              takes a message's link preview away for everyone, audited and pushed live.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { findMessage } from '../chat/messages.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { removeMessagePreview } from './store.js';

export function previewModerationRoutes(db, hub) {
  const router = express.Router();
  const loadMessage = loadById((id) => findMessage(db, id), 'message', 'message');

  router.post('/messages/:id/preview/remove', allow('organiser'), loadMessage, (req, res) => {
    if (!removeMessagePreview(db, req.message.id)) {
      return sendError(res, 404, 'not_found', 'This message has no preview.');
    }
    recordAudit(db, req.user, {
      action: 'chat.preview_remove',
      targetType: 'chat_message',
      targetId: req.message.id,
      before: { author: req.message.author },
      after: { preview: null },
    });
    hub.broadcast(req.message.roomId, { type: 'previewRemoved', id: req.message.id });
    res.json({ ok: true });
  });

  return router;
}
