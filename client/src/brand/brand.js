// ============================================================
// File:        brand.js
// Path:        client/src/brand/brand.js
// Project:     Seasonal Entertainment
// Description: The SE style's images in one place (docs/DESIGN.md, "Brand images"): the logo,
//              its round emblem and the emblem's four quarters (client/public/brand/, made by
//              scripts/build-brand-images.mjs), which quarter belongs to which section, and the
//              four season marks by token id.
// ============================================================

import spring from '../assets/seasons/spring.svg';
import summer from '../assets/seasons/summer.svg';
import autumn from '../assets/seasons/autumn.svg';
import winter from '../assets/seasons/winter.svg';

// Served as they are from client/public/ (no hashing: the files are rebuilt by hand).
export const LOGO = '/brand/logo.webp';
export const EMBLEM = '/brand/emblem.webp';

// Each section's quarter of the emblem (its mark in the page header and its faint wash).
export const QUARTERS = {
  games: '/brand/quarter-games.webp', // controller
  events: '/brand/quarter-events.webp', // football and basketball
  chat: '/brand/quarter-chat.webp', // circle of people
  calls: '/brand/quarter-calls.webp', // play button
};

export const SEASON_ICONS = { spring, summer, autumn, winter };
