// ============================================================
// File:        middleware.js
// Path:        server/src/calls/middleware.js
// Project:     Seasonal Entertainment
// Description: Route steps shared by the call routes, each placed after allow(...): calls
//              configured at all, load the call (:id), the call is live, load a participant
//              (:identity) or the asking member's own participant row, and the per-account
//              rate limit for call actions.
// ============================================================

import { sendError } from '../http/errors.js';
import { loadById } from '../http/loadById.js';
import { makeLimiter } from '../http/rateLimit.js';
import { findParticipant, findParticipantOfUser } from './participants.js';
import { findCall } from './store.js';

export function callSteps(db, config, service) {
  return {
    configured: (_req, res, next) =>
      service ? next() : sendError(res, 503, 'calls_not_configured', 'Calls are not set up.'),
    loadCall: loadById((id) => findCall(db, id), 'call', 'call'),
    live: (req, res, next) => {
      if (req.call.status === 'live') return next();
      return req.call.status === 'ended'
        ? sendError(res, 410, 'call_ended', 'This call has ended.')
        : sendError(res, 409, 'not_started', 'This call has not started yet.');
    },
    // req.target: the participant :identity names (organiser actions).
    loadTarget: (req, res, next) => {
      req.target = findParticipant(db, req.call.id, req.params.identity);
      return req.target ? next() : sendError(res, 404, 'not_found', 'No such participant.');
    },
    // req.me: the asking member in this call (they must have joined).
    loadMe: (req, res, next) => {
      req.me = findParticipantOfUser(db, req.call.id, req.user.id);
      return req.me ? next() : sendError(res, 409, 'not_joined', 'Join the call first.');
    },
    perUser: makeLimiter(config.rateLimits.callAction, {
      keyGenerator: (req) => `user:${req.user.id}`,
    }),
  };
}
