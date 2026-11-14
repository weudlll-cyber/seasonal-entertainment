// ============================================================
// File:        alerts.js
// Path:        server/src/settings/groups/alerts.js
// Project:     Seasonal Entertainment
// Description: The "Alerts" group of site settings (definitions.js): where the host's outage
//              watchdog sends its "down" and "back up" e-mails (docs/DEPLOYMENT.md, "An e-mail
//              when the site is down"; decided 2026-11-14). Empty: no e-mails. The site writes
//              it into a file the watchdog reads (alerts/outageFiles.js).
// ============================================================

export const OUTAGE_ADDRESS = 'alerts.outageAddress';

// One plain address: no spaces, brackets, quotes or commas, so it can only ever be one
// recipient and never carry a header of its own into the mail.
const ADDRESS = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/;

export const ALERT_SETTINGS = {
  [OUTAGE_ADDRESS]: {
    type: 'text',
    label: 'Outage alert address',
    help: 'An e-mail goes here when the site or the call service stops answering, and when both are back. Empty: no e-mails.',
    default: '',
    // The longest an e-mail address can be (RFC 5321's path limit).
    maxLength: 254,
    validate: (value) =>
      value === '' || ADDRESS.test(value)
        ? null
        : 'Outage alert address must be one e-mail address.',
  },
};
