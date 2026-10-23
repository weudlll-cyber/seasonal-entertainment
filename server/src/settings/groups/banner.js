// ============================================================
// File:        banner.js
// Path:        server/src/settings/groups/banner.js
// Project:     Seasonal Entertainment
// Description: The "Site banner" group of site settings (definitions.js): a line at the top of
//              every page for everyone, off by default. Plain text (shown as text: no HTML, no
//              Markdown), an optional link to a page of this site, and its style. All public.
// ============================================================

import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';

// A path on this site: one leading slash (never "//", which would leave the site), then the
// characters of a path, query or fragment.
const SITE_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/?#=&%+]*$/;

export const BANNER_SETTINGS = {
  'banner.enabled': {
    type: 'boolean',
    public: true,
    label: 'Show the banner',
    help: 'At the top of every page, for everyone; a viewer can dismiss it until its text changes.',
    default: PUBLIC_SETTING_DEFAULTS['banner.enabled'],
  },
  // At most 200 characters: one or two lines on a phone.
  'banner.text': {
    type: 'text',
    public: true,
    label: 'Banner text',
    help: 'Plain text; HTML and Markdown show as typed.',
    maxLength: 200,
    default: PUBLIC_SETTING_DEFAULTS['banner.text'],
  },
  'banner.link': {
    type: 'text',
    public: true,
    label: 'Banner link',
    help: 'Optional: a page of this site, as a path such as /start.',
    maxLength: 200,
    validate: (value) =>
      value === '' || SITE_PATH.test(value)
        ? null
        : 'The link must be a page of this site, a path starting with one /, such as /start.',
    default: PUBLIC_SETTING_DEFAULTS['banner.link'],
  },
  'banner.style': {
    type: 'choice',
    public: true,
    label: 'Banner style',
    help: 'Info for news, warning for something visitors must know.',
    choices: [
      { value: 'info', label: 'Info' },
      { value: 'warning', label: 'Warning' },
    ],
    default: PUBLIC_SETTING_DEFAULTS['banner.style'],
  },
};
