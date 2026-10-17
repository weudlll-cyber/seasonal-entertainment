// ============================================================
// File:        navigation.js
// Path:        client/src/app/navigation.js
// Project:     Seasonal Entertainment
// Description: The one list of header navigation targets, footer links and admin area
//              sections, used by the header, footer, admin layout and their tests.
// ============================================================

export const MAIN_NAV = [
  { to: '/', label: 'Home' },
  { to: '/info', label: 'Info' },
  { to: '/games', label: 'Games' },
  { to: '/events', label: 'Events' },
  { to: '/chat', label: 'Chat' },
];

// Imprint and Privacy are info pages (slugs "imprint" and "privacy").
export const FOOTER_NAV = [
  { to: '/info/imprint', label: 'Imprint' },
  { to: '/info/privacy', label: 'Privacy' },
];

// Sections of the admin area (/admin); each later area adds its editor here.
export const ADMIN_NAV = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/info', label: 'Info pages' },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/audit', label: 'Audit log' },
];
