// ============================================================
// File:        definitions.js
// Path:        server/src/settings/definitions.js
// Project:     Seasonal Entertainment
// Description: Every admin-editable site setting, gathered from its group's file (groups/):
//              group, kind (types.js), label and one-line explanation for the admin page,
//              unit, default and the rules a value must meet (with the reason for each bound
//              next to it). The admin page shows the groups in GROUPS order.
// ============================================================

import { ACCOUNT_SETTINGS } from './groups/accounts.js';
import { BANNER_SETTINGS } from './groups/banner.js';
import { CALL_SETTINGS } from './groups/calls.js';
import { CHAT_SETTINGS } from './groups/chat.js';
import { HOME_SETTINGS } from './groups/home.js';
import { RECAP_SETTINGS } from './groups/recap.js';

export const GROUPS = [
  'Chat',
  'Other sites',
  'Calls',
  'Accounts',
  'Home',
  'Weekly recap',
  'Site banner',
];

// group name -> that group's settings.
const BY_GROUP = {
  Chat: CHAT_SETTINGS,
  Calls: CALL_SETTINGS,
  Accounts: ACCOUNT_SETTINGS,
  Home: HOME_SETTINGS,
  'Weekly recap': RECAP_SETTINGS,
  'Site banner': BANNER_SETTINGS,
};

export const SETTINGS = Object.fromEntries(
  Object.entries(BY_GROUP).flatMap(([group, settings]) =>
    Object.entries(settings).map(([key, definition]) => [key, { group, ...definition }])
  )
);
