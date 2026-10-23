// ============================================================
// File:        siteSettings.js
// Path:        shared/siteSettings.js
// Project:     Seasonal Entertainment
// Description: The site settings the browser needs (docs/SETTINGS.md) and their defaults,
//              one table for both sides: the server defines them with these defaults
//              (server/src/settings/groups/) and sends their current values with the session;
//              the client falls back to these until that answer is there.
// ============================================================

export const PUBLIC_SETTING_DEFAULTS = {
  'chat.uploads': true,
  'chat.directFiles': true,
  'accounts.registrationOpen': true,
  'home.seasonClock': true,
  'home.startHere': true,
  'banner.enabled': false,
  'banner.text': '',
  'banner.link': '',
  'banner.style': 'info',
};
