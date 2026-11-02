// ============================================================
// File:        rateLimit.js
// Path:        server/src/http/rateLimit.js
// Project:     Seasonal Entertainment
// Description: Builds rate limiters with one answer shape (429 too_many_attempts). Windows
//              and counts come from config.rateLimits, so tests can tighten them.
// ============================================================

import { rateLimit } from 'express-rate-limit';
import { sendError } from './errors.js';

// options.keyGenerator: per user instead of per IP (authenticated routes, as in the race
//                       game: colleagues behind one address must not lock each other out)
// options.failedOnly:   only failed attempts count (login, password change)
// options.succeeded:    (req, res) => whether the request succeeded, for failedOnly routes that
//                       answer failures with a redirect (the Discord callback), not a 4xx
// options.onLimit:      (req, res) => the answer when limited, instead of the JSON 429 (a
//                       browser navigation is better answered with a redirect)
export function makeLimiter({ windowMs, max }, options = {}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: options.failedOnly === true,
    ...(options.succeeded && { requestWasSuccessful: options.succeeded }),
    ...(options.keyGenerator && { keyGenerator: options.keyGenerator }),
    handler:
      options.onLimit ??
      ((_req, res) =>
        sendError(res, 429, 'too_many_attempts', 'Too many attempts. Please try again later.')),
  });
}
