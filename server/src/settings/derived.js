// ============================================================
// File:        derived.js
// Path:        server/src/settings/derived.js
// Project:     Seasonal Entertainment
// Description: Site settings in the units the code works in (the admin page shows MB and
//              megapixels): the upload limits in bytes, the image limit in pixels. Read at
//              each use, so a change applies to the next upload or image.
// ============================================================

import { getSetting } from './store.js';

const MIB = 1024 * 1024;

// { maxBytes, dailyBytes }: one file, and one member's uploads over 24 hours.
export const uploadLimits = (db) => ({
  maxBytes: Math.round(getSetting(db, 'chat.uploadMaxMb') * MIB),
  dailyBytes: Math.round(getSetting(db, 'chat.uploadDailyMb') * MIB),
});

// Width x height an image may have, read from its header before decoding (media/imageCheck.js).
export const imageMaxPixels = (db) => getSetting(db, 'chat.imageMaxMegapixels') * 1_000_000;
