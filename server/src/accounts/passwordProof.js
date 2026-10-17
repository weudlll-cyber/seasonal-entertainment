// ============================================================
// File:        passwordProof.js
// Path:        server/src/accounts/passwordProof.js
// Project:     Seasonal Entertainment
// Description: "Enter your password again" on the server: the signed-in account proves its
//              current password with the auth key the browser derived from it (docs/AUTH.md).
//              Used wherever an action needs more than the session: own password change, 2FA
//              setup and disable, creating or replacing the account's keys.
// ============================================================

import { verifyPassword } from './passwords.js';
import { findPasswordHash } from './userStore.js';

export function provesPassword(db, config, userId, authKey) {
  return verifyPassword(authKey, findPasswordHash(db, userId), config.bcryptCost);
}
