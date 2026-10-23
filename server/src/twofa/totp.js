// ============================================================
// File:        totp.js
// Path:        server/src/twofa/totp.js
// Project:     Seasonal Entertainment
// Description: Time-based one-time passwords (RFC 6238, HMAC-SHA1, 30-second steps, 6 digits),
//              the format every authenticator app reads. Tested against the RFC's own vectors.
// ============================================================

import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648 base32
const STEP_SECONDS = 30;

export function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5)
    out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

export function base32Decode(text) {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error('invalid base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// 20 random bytes (160 bits), the size RFC 4226 recommends for SHA-1.
export function generateSecret() {
  return base32Encode(randomBytes(20));
}

export function stepAt(timeMs) {
  return Math.floor(timeMs / 1000 / STEP_SECONDS);
}

export function codeForStep(secret, step, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  // Dynamic truncation (RFC 4226 section 5.3).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

// Accepts the current step and one either side (clock drift). Returns the matching step, or
// null. The caller refuses steps it has already seen, so a code works only once.
export function matchStep(secret, code, timeMs) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const now = stepAt(timeMs);
  for (const step of [now - 1, now, now + 1]) {
    if (codeForStep(secret, step) === code) return step;
  }
  return null;
}

export function otpauthUrl(secret, accountName, issuer) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params}`;
}
