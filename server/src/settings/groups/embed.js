// ============================================================
// File:        embed.js
// Path:        server/src/settings/groups/embed.js
// Project:     Seasonal Entertainment
// Description: The "Other sites" group of site settings (definitions.js): what guests may do
//              in the chat embedded on an approved other site, whether members upload there,
//              and whether they see members-only images and downloads there (docs/EMBED.md); the
//              last two are independent of each other (decided 2026-10-23). Each is the
//              global rule; Admin → Embedding can override it per site (inherit / on / off,
//              embed/origins.js).
// ============================================================

export const EMBED_SETTINGS = {
  'embed.guestsRead': {
    type: 'boolean',
    label: 'Guests can read on other sites',
    help: 'Visitors without an account read the rooms open to everyone in the embedded chat.',
    default: true,
  },
  'embed.guestsWrite': {
    type: 'boolean',
    label: 'Guests can write on other sites',
    help: 'Visitors without an account write there under a guest name, as guests on this site do.',
    default: false,
  },
  'embed.uploads': {
    type: 'boolean',
    label: 'Uploads on other sites',
    help: 'Members attach images and PDFs in the embedded chat.',
    default: false,
  },
  'embed.images': {
    type: 'boolean',
    label: 'Images on other sites',
    help: 'Members see images and downloads of members-only rooms there, through short-lived links.',
    default: false,
  },
};
