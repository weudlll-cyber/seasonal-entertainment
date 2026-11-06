// ============================================================
// File:        tokenMatches.js
// Path:        server/src/http/tokenMatches.js
// Project:     Seasonal Entertainment
// Description: Comparing a secret a request sends with the one the server holds, in constant
//              time: the bootstrap token (accounts/bootstrap.js) and the games' sync token
//              (games/embeddedRoutes.js).
// ============================================================

import { createHash, timingSafeEqual } from 'node:crypto';

// Hashing first makes both sides the same length; a missing value never matches.
export function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const digest = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
