// ============================================================
// File:        navigation.js
// Path:        client/src/app/navigation.js
// Project:     Seasonal Entertainment
// Description: The one definition of the site's navigation: the sidebar's main items (with
//              their icons and season dots), the Calls item, the admin item and who sees it,
//              the legal links (with "Not financial advice"), and the admin area's sections.
//              Used by the sidebar, the admin layout and their tests.
// ============================================================

import { DISCLAIMER_PATH } from '@seasonal-entertainment/shared/disclaimer.js';

// Sidebar order (decided 2026-10-17). "Seasonal Tokens" is the info section. `dot`: the
// season colour of the section's quarter of the logo, shown as a small dot (docs/DESIGN.md).
export const MAIN_NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  // For everyone, below Home (2026-10-23): the five steps of the Start here page.
  { to: '/start', label: 'Start here', icon: 'start' },
  { to: '/games', label: 'Games', icon: 'games', dot: 'spring' },
  { to: '/events', label: 'Events', icon: 'events', dot: 'summer' },
  { to: '/chat', label: 'Chat', icon: 'chat', dot: 'autumn' },
  { to: '/info', label: 'Seasonal Tokens', icon: 'tokens' },
];

// A call's own page (/calls/<id>): its own chat (no chat drawer) and the sidebar as a rail.
export const isCallPage = (pathname) => /^\/calls\/\d+/.test(pathname);

// Calls: after Chat, shown when calls are set up (admins always: they see "not configured").
export const CALLS_ITEM = { to: '/calls', label: 'Calls', icon: 'mic', dot: 'winter' };

const ADMIN_ITEM = { to: '/admin', label: 'Admin', icon: 'admin' };

// The items below the divider for this account: Admin for admins only (as before the shell).
export function staffNavFor(user) {
  return user?.role === 'admin' ? [ADMIN_ITEM] : [];
}

// Imprint, Privacy and the Disclaimer are info pages (slugs "imprint", "privacy" and
// "disclaimer"); the Disclaimer's link says what it is about on every page (2026-10-23).
export const LEGAL_NAV = [
  { to: '/info/imprint', label: 'Imprint' },
  { to: '/info/privacy', label: 'Privacy' },
  { to: DISCLAIMER_PATH, label: 'Not financial advice' },
];

// Sections of the admin area (/admin); each later area adds its editor here.
export const ADMIN_NAV = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/info', label: 'Info pages' },
  { to: '/admin/games', label: 'Games' },
  { to: '/admin/chat', label: 'Chat' },
  { to: '/admin/chat-media', label: 'Chat media' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/embedding', label: 'Embedding' },
  { to: '/admin/audit', label: 'Audit log' },
];
