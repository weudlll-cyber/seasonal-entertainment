// ============================================================
// File:        embed.js
// Path:        server/src/settings/groups/embed.js
// Project:     Seasonal Entertainment
// Description: The "Other sites" group of site settings (definitions.js): what guests may do
//              in the chat embedded on an approved other site (docs/EMBED.md). Each is the
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
};
