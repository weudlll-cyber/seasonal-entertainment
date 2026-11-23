// ============================================================
// File:        secretKey.js
// Path:        server/src/secretKey.js
// Project:     Seasonal Entertainment
// Description: The server's two 32-byte keys, each 32 random bytes as base64 (openssl rand
//              -base64 32): SECRET_ENCRYPTION_KEY encrypts secrets the server must keep readable
//              but nobody with only the database may read (2FA secrets, twofa/secretBox.js);
//              RECOVERY_CODE_KEY keys the hashes of 2FA recovery codes (twofa/store.js, decided
//              2026-11-22). Production refuses to start without either or with a development
//              key; development without one uses a fixed, publicly known development key, says
//              so, and keeps working across restarts.
// ============================================================

const KEY_BYTES = 32;
// Public on purpose: they protect nothing and exist so development data survives restarts.
export const DEV_SECRET_KEY = Buffer.from('seasonal-entertainment-dev-only!').toString('base64');
export const DEV_RECOVERY_CODE_KEY = Buffer.from('seasonal-dev-only-recovery-codes').toString(
  'base64'
);
// Each key's development default and what the development warning says it leaves open.
const KEYS = {
  SECRET_ENCRYPTION_KEY: { dev: DEV_SECRET_KEY, open: '2FA secrets are NOT protected' },
  RECOVERY_CODE_KEY: { dev: DEV_RECOVERY_CODE_KEY, open: 'recovery codes are NOT protected' },
};

// value: the key as given in the environment variable `name`. Returns the key as bytes
// (Uint8Array). Messages name the variable, never the value.
export function readSecretKey(value, isProduction, name = 'SECRET_ENCRYPTION_KEY') {
  const { dev, open } = KEYS[name];
  if (!value) {
    if (isProduction) throw new Error(`[config] ${name} is required in production`);
    console.warn(
      `[config] ${name} not set: using the public development key; ${open} (development only)`
    );
    return readSecretKey(dev, false, name);
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES || key.toString('base64') !== value) {
    throw new Error(`[config] ${name} must be ${KEY_BYTES} bytes as base64`);
  }
  if (isProduction && value === dev) {
    throw new Error(`[config] the development ${name} is not allowed in production`);
  }
  return new Uint8Array(key);
}
