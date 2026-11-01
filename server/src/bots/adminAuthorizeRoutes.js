// ============================================================
// File:        adminAuthorizeRoutes.js
// Path:        server/src/bots/adminAuthorizeRoutes.js
// Project:     Seasonal Entertainment
// Description: GET /api/bot-admin/authorize: the host's nginx asks it (auth_request) before
//              every request to the event bot's admin page at /bot-admin/ (docs/BOTS.md, "The
//              event bot's admin page"; docs/AUTH.md). 204 with X-Acting-User for an organiser or
//              admin who passes the staff 2FA gate; the usual 401/403 otherwise. A state change
//              (X-Original-Method POST, PUT, PATCH, DELETE) also needs this site's Origin, the
//              CSRF rule, and writes one audit entry. Only while BOT_ADMIN_EMBEDDED=1, else 404.
//              Every answer is Cache-Control: no-store. The bot's token never reaches the site.
// ============================================================

import express from 'express';
import { recordAudit } from '../audit/auditLog.js';
import { allow } from '../http/access.js';
import { isStateChanging, originRefusal } from '../http/csrf.js';
import { sendError } from '../http/errors.js';

// Methods that only read: let through without an audit entry.
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
// An audit entry keeps at most this much of the path (nginx's $request_uri has no limit here).
const PATH_MAX = 300;

// The path of nginx's X-Original-URI: never its query string (it may carry values the audit log
// must not keep), and never more than PATH_MAX characters.
const originalPath = (req) => (req.get('x-original-uri') ?? '').split(/[?#]/)[0].slice(0, PATH_MAX);

export function botAdminRoutes(db, config) {
  const router = express.Router();

  // Before the guard, so its 401/403 are not cached either; off, nothing here exists.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!config.botAdminEmbedded) return sendError(res, 404, 'not_found', 'No such API endpoint.');
    next();
  });

  // allow('organiser') is the site's own rule: signed in (a locked account's session has
  // already ended, http/session.js), organiser or admin, and the staff 2FA gate passed.
  router.get('/authorize', allow('organiser'), (req, res) => {
    const method = (req.get('x-original-method') ?? '').toUpperCase();
    if (isStateChanging(method)) {
      // The browser's own Origin, carried by nginx: a foreign page cannot make a signed-in
      // organiser change the bot (the same rule as every state change on the site).
      const refusal = originRefusal(req, config);
      if (refusal) return sendError(res, 403, refusal.code, refusal.message);
      // Who changed what: the method and the path only, never a body or a header.
      recordAudit(db, req.user, {
        action: 'bot_admin.change',
        targetType: 'bot_admin',
        targetId: originalPath(req),
        after: { method },
      });
    } else if (!READS.has(method)) {
      // Fail closed: without nginx's method the request could be a change nobody checked.
      return sendError(res, 403, 'method_unknown', 'Request refused: unknown method.');
    }
    res.set('X-Acting-User', req.user.username);
    res.status(204).end();
  });

  return router;
}
