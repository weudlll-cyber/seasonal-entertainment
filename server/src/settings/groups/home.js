// ============================================================
// File:        home.js
// Path:        server/src/settings/groups/home.js
// Project:     Seasonal Entertainment
// Description: The "Home" group of site settings (definitions.js): the season clock on the
//              home page, and the "Start here" path (the sidebar item and home's "New here?
//              Start here"). Both public: the browser hides what is switched off.
// ============================================================

import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';

export const HOME_SETTINGS = {
  'home.seasonClock': {
    type: 'boolean',
    public: true,
    label: 'Season clock',
    help: "The token in season and the next halving, in the home page's banner.",
    default: PUBLIC_SETTING_DEFAULTS['home.seasonClock'],
  },
  'home.startHere': {
    type: 'boolean',
    public: true,
    label: '"Start here"',
    help: 'The sidebar item and "New here? Start here" on home; the page itself stays reachable.',
    default: PUBLIC_SETTING_DEFAULTS['home.startHere'],
  },
};
