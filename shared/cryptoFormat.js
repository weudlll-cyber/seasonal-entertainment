// ============================================================
// File:        cryptoFormat.js
// Path:        shared/cryptoFormat.js
// Project:     Seasonal Entertainment
// Description: Shape checks for the cryptographic values that travel between browser and
//              server (salts, auth keys, public keys, sealed keys, direct-message nonces and
//              ciphertexts). No libsodium here: the server validates shapes only and never
//              needs the WebAssembly module at run time.
// ============================================================

export const SALT_BYTES = 16; // crypto_pwhash_SALTBYTES
export const KEY_BYTES = 32; // auth key, public key
export const NONCE_BYTES = 24; // crypto_box / crypto_secretbox nonces
// A sealed private key: nonce (24) + key (32) + authentication tag (16).
export const SEALED_KEY_BYTES = 72;
// A private key sealed to a new device (crypto_box_seal): ephemeral key (32) + key (32) + tag (16).
export const DEVICE_SEALED_BYTES = 80;
// Upper bound for a direct message's ciphertext (base64 characters): room for the text plus a
// link preview's inline image of at most 50 KB (SE-NIGHT-5).
export const CIPHERTEXT_MAX = 120_000;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// Decoded byte length of a standard base64 string, or -1 when it is not one.
export function base64Length(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64.test(value)) return -1;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

// Validators in the server's style (validate.js): an error sentence or null.
export const exactBytes = (label, bytes) => (value) =>
  base64Length(value) === bytes ? null : `${label} is malformed.`;

export const boundedBase64 = (label, max) => (value) =>
  base64Length(value) > 0 && value.length <= max ? null : `${label} is malformed.`;
