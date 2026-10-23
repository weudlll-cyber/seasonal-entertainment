// ============================================================
// File:        routes.js
// Path:        server/src/embed/routes.js
// Project:     Seasonal Entertainment
// Description: /api/embed: whether a site is approved for the embedded chat, and what guests
//              may do there now (public, so the embed can verify its parent before it talks to
//              it and show guests what applies); a token for the embed on
//              an approved site, asked for by the login popup with the member's own cookie
//              session (never by a token); and, for a token, who it is and logging it out.
// ============================================================

import express from 'express';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { SITE_RULES, normaliseOrigin } from './origins.js';
import { issueToken, revokeToken } from './tokens.js';

// chatSessions: the chat handle's sessions (closes the sockets of a revoked token).
export function embedRoutes(db, config, origins, chatSessions) {
  const router = express.Router();
  // Plain http on this machine's own names is fine for trying it out, never in production.
  const local = { allowLocalHttp: !config.isProduction };
  const perUser = makeLimiter(config.rateLimits.embedToken, {
    keyGenerator: (req) => `user:${req.user.id}`,
  });

  router.get('/check', allow('public'), (req, res) => {
    const { origin } = normaliseOrigin(req.query.origin, local);
    if (!origin || !origins.allows(origin)) return res.json({ ok: true, allowed: false });
    // The rules as they hold on that site now: its own override, else the global setting.
    const guests = Object.fromEntries(SITE_RULES.map((rule) => [rule, origins.rule(origin, rule)]));
    res.json({ ok: true, allowed: true, ...guests });
  });

  // Only for an approved site; the popup hands the token on to the embed (its opener).
  router.post('/token', allow('member'), perUser, (req, res) => {
    const { origin } = normaliseOrigin(req.body?.origin, local);
    if (!origin || !origins.allows(origin)) {
      return sendError(res, 403, 'origin_not_allowed', 'This site may not embed the chat.');
    }
    res.json({ ok: true, ...issueToken(db, req.user, origin) });
  });

  // For a token only (embed/auth.js lets tokens reach exactly these two).
  router.get('/me', allow('member'), (req, res) => {
    if (!req.embed) return sendError(res, 400, 'not_embedded', 'No embed token was sent.');
    res.json({ ok: true, origin: req.embed.origin, userId: req.embed.user.id });
  });

  router.post('/logout', allow('member'), (req, res) => {
    if (!req.embed) return sendError(res, 400, 'not_embedded', 'No embed token was sent.');
    revokeToken(db, req.embed.tokenId);
    chatSessions.embedRevoked({ tokenId: req.embed.tokenId });
    res.json({ ok: true });
  });

  return router;
}
