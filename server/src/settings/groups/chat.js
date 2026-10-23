// ============================================================
// File:        chat.js
// Path:        server/src/settings/groups/chat.js
// Project:     Seasonal Entertainment
// Description: The "Chat" group of site settings (definitions.js): file uploads and their
//              limits, link previews, files in direct messages, connection and message limits,
//              how long messages are kept. Defaults are today's values; where config.js (an env
//              value) held one, that value is the default and the setting rules at runtime.
// ============================================================

import { PUBLIC_SETTING_DEFAULTS } from '@seasonal-entertainment/shared/siteSettings.js';

const MIB = 1024 * 1024;

export const CHAT_SETTINGS = {
  'chat.uploads': {
    type: 'boolean',
    public: true, // the composer hides "Attach file" when off
    label: 'File uploads in rooms',
    help: 'Members attach images and PDFs to room messages.',
    default: PUBLIC_SETTING_DEFAULTS['chat.uploads'],
  },
  // At least 1 MB, so a phone photo still fits; at most 25 MB, since the server holds a whole
  // file in memory while it checks and re-encodes it (more would need streaming first).
  'chat.uploadMaxMb': {
    type: 'integer',
    label: 'Largest file',
    help: 'One upload, in rooms and in direct messages.',
    unit: 'MB',
    default: (config) => config.uploads.maxBytes / MIB,
    min: 1,
    max: 25,
  },
  // At least 1 MB, so a member can still send something; at most 1000 MB, since uploads stay on
  // the server's disk until the retention job removes them.
  'chat.uploadDailyMb': {
    type: 'integer',
    label: 'Uploads per member per day',
    help: 'Rooms and direct messages together, over the last 24 hours.',
    unit: 'MB',
    default: (config) => config.uploads.dailyBytes / MIB,
    min: 1,
    max: 1000,
  },
  // At least 12, so an ordinary phone photo still fits; at most 100, since decoding one image
  // that large already takes about 400 MB of memory.
  'chat.imageMaxMegapixels': {
    type: 'integer',
    label: 'Largest image',
    help: 'Width x height, read before decoding: uploads, link previews, event bot images.',
    unit: 'megapixels',
    default: (config) => config.imageMaxPixels / 1_000_000,
    min: 12,
    max: 100,
  },
  'chat.roomPreviews': {
    type: 'boolean',
    label: 'Link previews in rooms',
    help: "The server fetches a card for a member's first https link.",
    default: (config) => config.linkPreviews.enabled,
  },
  'chat.directPreviews': {
    type: 'boolean',
    label: 'Link previews in direct messages',
    help: "The sender's card, inside the encrypted message; each member's own switch still applies.",
    default: (config) => config.linkPreviews.enabled,
  },
  'chat.directFiles': {
    type: 'boolean',
    public: true, // the direct-message composer hides "Attach file" when off
    label: 'Files in direct messages',
    help: 'Encrypted files between two members.',
    default: PUBLIC_SETTING_DEFAULTS['chat.directFiles'],
  },
  // At least 1, or a member could not connect at all; at most 100, since each open connection
  // holds memory and a socket on the server.
  'chat.maxConnectionsPerMember': {
    type: 'integer',
    label: 'Open connections per member',
    help: 'Tabs, the chat drawer and embedded chats of one account together.',
    unit: 'connections',
    default: (config) => config.chat.maxConnectionsPerMember,
    min: 1,
    max: 100,
  },
  // At least 1, or guests could not read live; at most 1000, the same reason as above.
  'chat.maxGuestConnectionsPerIp': {
    type: 'integer',
    label: 'Open connections per guest address',
    help: 'Guests without an account, counted per address.',
    unit: 'connections',
    default: (config) => config.chat.maxGuestConnectionsPerIp,
    min: 1,
    max: 1000,
  },
  // At least 1, or no one could write; at most 30, since three messages a second already flood
  // a room.
  'chat.memberMessages': {
    type: 'integer',
    label: 'Messages per member',
    help: 'How many a member may send within 10 seconds.',
    unit: 'per 10 seconds',
    default: (config) => config.chat.rate.member.max,
    min: 1,
    max: 30,
  },
  'chat.guestMessages': {
    type: 'integer',
    label: 'Messages per guest',
    help: 'How many a guest may send within 10 seconds; usually fewer than members.',
    unit: 'per 10 seconds',
    default: (config) => config.chat.rate.guest.max,
    min: 1,
    max: 30,
  },
  // At least 7 days, so a week's conversation stays readable and reports can still be reviewed;
  // at most 3650 (ten years).
  'chat.retentionDays': {
    type: 'integer',
    label: 'Keep messages',
    help: 'Older messages are deleted by the retention job (every 6 hours).',
    unit: 'days',
    default: (config) => config.chat.retentionDays,
    min: 7,
    max: 3650,
  },
};
