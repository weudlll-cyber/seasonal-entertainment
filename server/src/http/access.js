// ============================================================
// File:        access.js
// Path:        server/src/http/access.js
// Project:     Seasonal Entertainment
// Description: Deny-by-default authorisation. Every route's FIRST handler must be allow(...)
//              naming who may call it; findUndeclaredRoutes() lists routes that do not, and a
//              test fails on any (pattern of the race game's route-policy drift test).
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { sendError } from './errors.js';

const ACCESS = Symbol('access');

// 'public'    anyone, including guests
// 'member'    any signed-in account
// 'organiser' organiser or admin
// 'admin'     admin only
export const ACCESS_LEVELS = ['public', 'member', 'organiser', 'admin'];

export function allow(level) {
  if (!ACCESS_LEVELS.includes(level)) throw new Error(`unknown access level "${level}"`);
  const guard = (req, res, next) => {
    if (level === 'public') return next();
    if (!req.user) return sendError(res, 401, 'not_authenticated', 'Please log in.');
    if (level !== 'member') {
      if (!roleAtLeast(req.user.role, level)) {
        return sendError(res, 403, 'forbidden', 'You are not allowed to do this.');
      }
      // Set by the 2FA gate (twofa/gate.js) when a staff account still lacks 2FA.
      const refusal = req.staffRefusal;
      if (refusal) return sendError(res, 403, refusal.code, refusal.message);
    }
    next();
  };
  guard[ACCESS] = level;
  return guard;
}

// Walks the app's router tree; returns "METHOD path" for every route whose first handler is
// not an allow(...) guard.
export function findUndeclaredRoutes(app) {
  const missing = [];
  const walk = (stack) => {
    for (const layer of stack) {
      if (layer.route) {
        const first = layer.route.stack[0]?.handle;
        if (!first?.[ACCESS]) {
          const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
          missing.push(`${methods} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(app.router.stack);
  return missing;
}
