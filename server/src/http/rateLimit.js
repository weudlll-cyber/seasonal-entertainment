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
export function makeLimiter({ windowMs, max }, options = {}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: options.failedOnly === true,
    ...(options.keyGenerator && { keyGenerator: options.keyGenerator }),
    handler: (_req, res) =>
      sendError(res, 429, 'too_many_attempts', 'Too many attempts. Please try again later.'),
  });
}
