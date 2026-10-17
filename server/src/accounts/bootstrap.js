// ============================================================
// File:        bootstrap.js
// Path:        server/src/accounts/bootstrap.js
// Project:     Seasonal Entertainment
// Description: POST /api/auth/bootstrap: creates the FIRST admin, once, gated by the
//              BOOTSTRAP_TOKEN from the environment. Pattern and pitfalls from the race game's
//              AUTH.md: the token travels in the x-bootstrap-token HEADER, never the body;
//              "not configured" and "wrong token" give the same answer and differ only in the
//              server log, which never contains the token.
// ============================================================

import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';
import { allow } from '../http/access.js';
import { sendError } from '../http/errors.js';
import { makeLimiter } from '../http/rateLimit.js';
import { startSession } from '../http/session.js';
import { validBody } from '../http/validate.js';
import { hashPassword } from './passwords.js';
import { countAdmins, createUser, publicUser } from './userStore.js';

// Constant-time comparison; hashing first makes both sides the same length.
function tokenMatches(given, expected) {
  const digest = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function bootstrapRoutes(db, config, log = console.warn) {
  const router = express.Router();

  router.post(
    '/bootstrap',
    allow('public'),
    makeLimiter(config.rateLimits.bootstrap),
    async (req, res) => {
      const given = req.get('x-bootstrap-token');
      if (!config.bootstrapToken) {
        log('[bootstrap] BOOTSTRAP_TOKEN not set; bootstrap disabled');
        return sendError(res, 403, 'bootstrap_unavailable', 'Bootstrap is not available.');
      }
      if (!given || !tokenMatches(given, config.bootstrapToken)) {
        log('[bootstrap] bootstrap token mismatch; refused');
        return sendError(res, 403, 'bootstrap_unavailable', 'Bootstrap is not available.');
      }
      const input = validBody(req, res, {
        username: validateUsername,
        email: validateEmail,
        password: validatePassword,
      });
      if (!input) return;
      const passwordHash = await hashPassword(input.password, config.bcryptCost);
      // Check and insert in one transaction: two simultaneous requests cannot both win.
      const admin = db.transaction(() => {
        if (countAdmins(db) > 0) return null;
        return createUser(db, { ...input, passwordHash, role: 'admin' });
      })();
      if (!admin) {
        return sendError(res, 409, 'bootstrap_done', 'An admin already exists.');
      }
      await startSession(req, admin);
      res.status(201).json({ ok: true, user: publicUser(admin) });
    }
  );

  return router;
}
