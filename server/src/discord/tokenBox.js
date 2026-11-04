// ============================================================
// File:        tokenBox.js
// Path:        server/src/discord/tokenBox.js
// Project:     Seasonal Entertainment
// Description: Discord refresh tokens at rest: sealed exactly like 2FA secrets (sealSecret of
//              twofa/secretBox.js: libsodium secretbox under SECRET_ENCRYPTION_KEY, "enc1:" +
//              base64), opened here. A token that does not open (another key, a changed row)
//              counts as gone: the link then needs a Discord login again. Never logged.
// ============================================================

import { openSealed } from '@seasonal-entertainment/shared/crypto.js';
import { sealSecret } from '../twofa/secretBox.js';

const PREFIX = 'enc1:';

export const sealToken = (token, key) => sealSecret(token, key);

// The token, or null when it does not open with this key.
export async function openToken(stored, key) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return null;
  const bytes = await openSealed(stored.slice(PREFIX.length), key);
  return bytes ? new TextDecoder().decode(bytes) : null;
}
