// ============================================================
// File:        csrf.js
// Path:        server/src/http/csrf.js
// Project:     Seasonal Entertainment
// Description: CSRF protection for state-changing API requests: the Origin (or Referer)
//              must be this site's own origin. Together with SameSite=Lax session cookies
//              this blocks cross-site form posts and fetches (pattern from the race game).
//              selfOrigin() is also the rule for the chat WebSocket's Origin check.
// ============================================================

import { sendError } from './errors.js';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// The site's own origin: configured, or derived from the request (correct without a proxy).
// Works on an Express request and on a bare WebSocket upgrade request, which has no
// req.protocol: there the connection itself tells whether it is TLS.
export function selfOrigin(req, config) {
  if (config.publicOrigin) return config.publicOrigin;
  const protocol = req.protocol ?? (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host}`;
}

function requestOrigin(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid';
  }
}

export function csrfGuard(config) {
  return (req, res, next) => {
    if (!STATE_CHANGING.has(req.method)) return next();
    const origin = requestOrigin(req);
    if (!origin) {
      if (!config.csrfStrict) return next();
      return sendError(res, 403, 'origin_required', 'Request refused: no Origin header.');
    }
    if (origin !== selfOrigin(req, config)) {
      return sendError(res, 403, 'cross_origin', 'Request refused: wrong origin.');
    }
    next();
  };
}
