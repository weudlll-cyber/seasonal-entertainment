// ============================================================
// File:        csrf.js
// Path:        server/src/http/csrf.js
// Project:     Seasonal Entertainment
// Description: CSRF protection for state-changing API requests: the Origin (or Referer)
//              must be this site's own origin. Together with SameSite=Lax session cookies
//              this blocks cross-site form posts and fetches (pattern from the race game).
//              selfOrigin() is also the rule for the chat WebSocket's Origin check;
//              originRefusal() the same rule for a request the site only authorises for another
//              service (the event bot's admin page, bots/adminAuthorizeRoutes.js).
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

export const isStateChanging = (method) => STATE_CHANGING.has(method);

// Why a state-changing request must be refused ({ code, message }), or null when its Origin
// (or Referer) is this site's own.
export function originRefusal(req, config) {
  const origin = requestOrigin(req);
  if (!origin) {
    if (!config.csrfStrict) return null;
    return { code: 'origin_required', message: 'Request refused: no Origin header.' };
  }
  if (origin !== selfOrigin(req, config)) {
    return { code: 'cross_origin', message: 'Request refused: wrong origin.' };
  }
  return null;
}

export function csrfGuard(config) {
  return (req, res, next) => {
    if (!isStateChanging(req.method)) return next();
    const refusal = originRefusal(req, config);
    if (refusal) return sendError(res, 403, refusal.code, refusal.message);
    next();
  };
}
