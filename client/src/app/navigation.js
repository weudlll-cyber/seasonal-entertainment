// ============================================================
// File:        navigation.js
// Path:        client/src/app/navigation.js
// Project:     Seasonal Entertainment
// Description: The one list of header navigation targets and footer links, used by the
//              header, the footer and their tests.
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
