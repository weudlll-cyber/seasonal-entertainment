// ============================================================
// File:        navigation.js
// Path:        client/src/app/navigation.js
// Project:     Seasonal Entertainment
// Description: The one definition of the site's navigation: the sidebar's main items (with
//              their icons), the Calls item, the admin item and who sees it, the legal links, and the admin
//              area's sections. Used by the sidebar, the admin layout and their tests.
// ============================================================

// Sidebar order (decided 2026-10-17). "Seasonal Tokens" is the info section.
export const MAIN_NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/games', label: 'Games', icon: 'games' },
  { to: '/events', label: 'Events', icon: 'events' },
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/info', label: 'Seasonal Tokens', icon: 'tokens' },
];

// A call's own page (/calls/<id>): its own chat (no chat drawer) and the sidebar as a rail.
export const isCallPage = (pathname) => /^\/calls\/\d+/.test(pathname);

// Calls: after Chat, shown when calls are set up (admins always: they see "not configured").
export const CALLS_ITEM = { to: '/calls', label: 'Calls', icon: 'mic' };

export const ADMIN_ITEM = { to: '/admin', label: 'Admin', icon: 'admin' };

// The items below the divider for this account: Admin for admins only (as before the shell).
export function staffNavFor(user) {
  return user?.role === 'admin' ? [ADMIN_ITEM] : [];
}

// Imprint and Privacy are info pages (slugs "imprint" and "privacy").
export const LEGAL_NAV = [
  { to: '/info/imprint', label: 'Imprint' },
  { to: '/info/privacy', label: 'Privacy' },
];

// Sections of the admin area (/admin); each later area adds its editor here.
export const ADMIN_NAV = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/info', label: 'Info pages' },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/games', label: 'Games' },
  { to: '/admin/chat', label: 'Chat' },
  { to: '/admin/chat-media', label: 'Chat media' },
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/audit', label: 'Audit log' },
];
