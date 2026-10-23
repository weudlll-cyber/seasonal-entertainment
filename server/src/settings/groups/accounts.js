// ============================================================
// File:        accounts.js
// Path:        server/src/settings/groups/accounts.js
// Project:     Seasonal Entertainment
// Description: The "Accounts" group of site settings (definitions.js): how long an unused
//              session lasts, whether anyone may register, and 2FA for every member. The 2FA
//              rule for organisers and admins stays fixed (twofa/gate.js).
// ============================================================

import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';

export const ACCOUNT_SETTINGS = {
  // At least 1 day, so no one is signed out in the middle of a day; at most 90 days, so a
  // session forgotten on a shared computer still ends within a season.
  'accounts.sessionIdleDays': {
    type: 'integer',
    label: 'Sign out after',
    help: 'A signed-in session that is not used for this long ends; using it starts the count again.',
    unit: 'days without use',
    default: 7,
    min: 1,
    max: 90,
  },
  'accounts.registrationOpen': {
    type: 'boolean',
    public: true, // the register page says it is closed
    label: 'Registration open',
    help: 'Anyone may create an account; setting up the first admin works either way.',
    default: PUBLIC_SETTING_DEFAULTS['accounts.registrationOpen'],
  },
  'accounts.require2faAll': {
    type: 'boolean',
    label: 'Require 2FA for every member',
    help: 'Members without 2FA set it up at their next login before using member features.',
    default: false,
  },
};
