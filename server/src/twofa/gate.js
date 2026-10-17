// ============================================================
// File:        gate.js
// Path:        server/src/twofa/gate.js
// Project:     Seasonal Entertainment
// Description: The 2FA requirement for staff: an organiser or admin without 2FA can log in,
//              but every organiser/admin action is refused until 2FA is set up. The gate marks
//              the request; allow() (http/access.js) refuses staff routes for marked requests.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { isTwoFactorEnabled } from './store.js';

export function needsTwoFactorSetup(db, config, user) {
  return (
    config.requireStaff2fa &&
    roleAtLeast(user.role, 'organiser') &&
    !isTwoFactorEnabled(db, user.id)
  );
}

export function staffTwoFactorGate(db, config) {
  return (req, _res, next) => {
    if (req.user && needsTwoFactorSetup(db, config, req.user)) {
      req.staffRefusal = {
        code: 'two_factor_required',
        message: 'Your role requires two-factor authentication. Set it up on your account page.',
      };
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
