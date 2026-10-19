// ============================================================
// File:        adminRoutes.js
// Path:        server/src/embed/adminRoutes.js
// Project:     Seasonal Entertainment
// Description: /api/admin/embed-origins (admins only): the foreign sites allowed to embed the
//              chat (owner decision 2026-10-19), adding one and removing one. Every change is
//              audited. Removing a site ends its embed tokens and closes their chat sockets at
//              once; the CSP of /embed/* follows the list on the next request.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { selfOrigin } from '../http/csrf.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { normaliseOrigin } from './origins.js';
import { revokeOriginTokens } from './tokens.js';

export function adminEmbedRoutes(db, config, origins, chatSessions) {
  const router = express.Router();
  // Plain http on this machine's own names is fine for trying it out, never in production.
  const local = { allowLocalHttp: !config.isProduction };
  const audit = (req, action, origin) =>
    recordAudit(db, req.user, { action, targetType: 'embed_origin', targetId: origin });
  const answer = (res, status = 200) =>
    res.status(status).json({ ok: true, origins: origins.list() });

  router.get('/', allow('admin'), (_req, res) => answer(res));

  router.post('/', allow('admin'), (req, res) => {
    const { origin, error } = normaliseOrigin(req.body?.origin, local);
    if (error) return sendError(res, 400, 'invalid_input', error);
    if (origin === selfOrigin(req, config)) {
      return sendError(res, 400, 'invalid_input', 'This site embeds its own chat already.');
    }
    if (origins.add(origin)) audit(req, 'embed.origin_add', origin);
    answer(res, 201);
  });

  router.delete('/', allow('admin'), (req, res) => {
    const { origin, error } = normaliseOrigin(req.body?.origin, local);
    if (error) return sendError(res, 400, 'invalid_input', error);
    if (!origins.remove(origin))
      return sendError(res, 404, 'not_found', 'That site is not on the list.');
    revokeOriginTokens(db, origin);
    chatSessions.embedRevoked({ origin });
    audit(req, 'embed.origin_remove', origin);
    answer(res);
  });

  return router;
}
