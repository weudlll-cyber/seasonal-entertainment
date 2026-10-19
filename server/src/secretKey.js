// ============================================================
// File:        secretKey.js
// Path:        server/src/secretKey.js
// Project:     Seasonal Entertainment
// Description: The key that encrypts secrets the server must keep readable but nobody with
//              only the database may read (2FA secrets, twofa/secretBox.js): SECRET_ENCRYPTION_KEY,
//              32 random bytes as base64 (openssl rand -base64 32). Production refuses to start
//              without it or with the development key; development without it uses a fixed,
//              publicly known development key, says so, and keeps working across restarts.
// ============================================================

const KEY_BYTES = 32;
// Public on purpose: it protects nothing and exists so development data survives restarts.
export const DEV_SECRET_KEY = Buffer.from('seasonal-entertainment-dev-only!').toString('base64');

// value: SECRET_ENCRYPTION_KEY as given. Returns the key as bytes (Uint8Array).
export function readSecretKey(value, isProduction) {
  if (!value) {
    if (isProduction) throw new Error('[config] SECRET_ENCRYPTION_KEY is required in production');
    console.warn(
      '[config] SECRET_ENCRYPTION_KEY not set: using the public development key; ' +
        '2FA secrets are NOT protected (development only)'
    );
    return readSecretKey(DEV_SECRET_KEY, false);
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== value) {
    throw new Error(`[config] SECRET_ENCRYPTION_KEY must be ${KEY_BYTES} bytes as base64`);
  }
  if (isProduction && value === DEV_SECRET_KEY) {
    throw new Error('[config] the development SECRET_ENCRYPTION_KEY is not allowed in production');
  }
  return new Uint8Array(key);
}
