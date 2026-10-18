// ============================================================
// File:        totp.test.js
// Path:        server/test/totp.test.js
// Project:     Seasonal Entertainment
// Description: Guards the TOTP implementation with the RFC 6238 SHA-1 test vectors, base32
//              round trips and the one-step drift window.
// ============================================================

import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  codeForStep,
  generateSecret,
  matchStep,
  stepAt,
} from '../src/twofa/totp.js';

// RFC 6238 appendix B: secret "12345678901234567890" (ASCII), 8 digits, SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (RFC 6238)', () => {
  it.each(RFC_VECTORS)('at %i s the code is %s', (seconds, code) => {
    expect(codeForStep(RFC_SECRET, stepAt(seconds * 1000), 8)).toBe(code);
  });

  it('base32 round-trips and a new secret has 160 bits', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('accepts the previous, current and next step only', () => {
    const secret = generateSecret();
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(matchStep(secret, codeForStep(secret, step), now)).toBe(step);
    expect(matchStep(secret, codeForStep(secret, step - 1), now)).toBe(step - 1);
    expect(matchStep(secret, codeForStep(secret, step + 1), now)).toBe(step + 1);
    expect(matchStep(secret, codeForStep(secret, step - 2), now)).toBeNull();
    expect(matchStep(secret, 'abcdef', now)).toBeNull();
  });
});
