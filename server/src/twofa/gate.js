// ============================================================
// File:        gate.js
// Path:        server/src/twofa/gate.js
// Project:     Seasonal Entertainment
// Description: The 2FA requirement. Staff (fixed): an organiser or admin without 2FA can log
//              in, but every organiser/admin action is refused until 2FA is set up. Members,
//              while the "Require 2FA for every member" setting is on: a member without 2FA
//              counts as a guest everywhere but their account and 2FA routes (/auth, /2fa),
//              and member routes say why. The gate marks the request; allow() (http/access.js)
//              refuses marked requests.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { getSetting } from '../settings/store.js';
import { isTwoFactorEnabled } from './store.js';

// What a member without 2FA may still reach: logging out, the session, the 2FA setup itself.
const SETUP_PATHS = /^\/(auth|2fa)\//;

export function needsTwoFactorSetup(db, config, user) {
  if (isTwoFactorEnabled(db, user.id)) return false;
  return roleAtLeast(user.role, 'organiser')
    ? config.requireStaff2fa
    : getSetting(db, 'accounts.require2faAll');
}

export function twoFactorGate(db, config) {
  return (req, _res, next) => {
    if (req.user && needsTwoFactorSetup(db, config, req.user)) {
      if (roleAtLeast(req.user.role, 'organiser')) {
        req.staffRefusal = {
          code: 'two_factor_required',
          message: 'Your role requires two-factor authentication. Set it up on your account page.',
        };
      } else if (!SETUP_PATHS.test(req.path)) {
        req.memberRefusal = {
          code: 'two_factor_required',
          message: 'This site requires two-factor authentication. Set it up on your account page.',
        };
        req.user = null; // a guest until 2FA is set up
      }
    }
    next();
  };
}

// What the client needs to lead the user: is 2FA on, and must they set it up?
export function twoFactorStatus(db, config, user) {
  return {
    twoFactorEnabled: isTwoFactorEnabled(db, user.id),
    twoFactorRequired: needsTwoFactorSetup(db, config, user),
  };
}
