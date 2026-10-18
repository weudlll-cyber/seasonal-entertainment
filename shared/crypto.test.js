// ============================================================
// File:        crypto.test.js
// Path:        shared/crypto.test.js
// Project:     Seasonal Entertainment
// Description: Guards the project's one crypto helper and the shape checks: the key split is
//              deterministic per password and salt and gives two different keys; seals open
//              only with their key and never repeat a nonce; recovery codes have their grouped
//              format and are typed back in any case; direct messages open for both sides and
//              for nobody else.
// ============================================================

import sodiumModule from 'libsodium-wrappers-sumo';
import { describe, expect, it } from 'vitest';
import {
  decryptDirect,
  deriveAccountKeys,
  deriveRecoveryKey,
  encryptDirect,
  newKeyPair,
  newRecoveryCode,
  newSalt,
  normaliseRecoveryCode,
  openSealed,
  sealBytes,
} from './crypto.js';
import { base64Length, boundedBase64, exactBytes } from './cryptoFormat.js';

const SALT = 'AAECAwQFBgcICQoLDA0ODw==';
// Shared code has no Buffer (it runs in browsers too): libsodium's own base64.
const sodium = sodiumModule.default ?? sodiumModule;
const b64 = (bytes) => sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);

describe('login key split', () => {
  it('follows the documented recipe exactly (docs/AUTH.md)', async () => {
    // Recomputed straight from libsodium: Argon2id with the interactive limits, then the KDF
    // with ids 1 and 2 and the contexts "se-auth" / "se-wrap" as C strings (NUL-terminated).
    await sodium.ready;
    const master = sodium.crypto_pwhash(
      32,
      'correct-horse-1',
      sodium.from_base64(SALT, sodium.base64_variants.ORIGINAL),
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );
    const sub = (id, context) =>
      b64(sodium.crypto_kdf_derive_from_key(32, id, `${context}\0`, master));
    const keys = await deriveAccountKeys('correct-horse-1', SALT);
    expect(keys.authKey).toBe(sub(1, 'se-auth'));
    expect(b64(keys.wrapKey)).toBe(sub(2, 'se-wrap'));
  });

  it('is deterministic per password and salt, with two different keys', async () => {
    const a = await deriveAccountKeys('correct-horse-1', SALT);
    const b = await deriveAccountKeys('correct-horse-1', SALT);
    expect(a.authKey).toBe(b.authKey);
    expect(base64Length(a.authKey)).toBe(32);
    expect(a.wrapKey).toEqual(b.wrapKey);
    expect(b64(a.wrapKey)).not.toBe(a.authKey);
    const other = await deriveAccountKeys('correct-horse-2', SALT);
    expect(other.authKey).not.toBe(a.authKey);
    const salted = await deriveAccountKeys('correct-horse-1', await newSalt());
    expect(salted.authKey).not.toBe(a.authKey);
  });

  it('makes 16-byte random salts', async () => {
    const [x, y] = [await newSalt(), await newSalt()];
    expect(base64Length(x)).toBe(16);
    expect(x).not.toBe(y);
  });
});

describe('seals', () => {
  it('open with their key only, with a fresh nonce every time', async () => {
    const { wrapKey } = await deriveAccountKeys('correct-horse-1', SALT);
    const { wrapKey: wrong } = await deriveAccountKeys('wrong-horse-1', SALT);
    const secret = new Uint8Array([1, 2, 3, 4]);
    const sealed = await sealBytes(secret, wrapKey);
    expect(await openSealed(sealed, wrapKey)).toEqual(secret);
    expect(await openSealed(sealed, wrong)).toBeNull();
    expect(await openSealed('not base64!', wrapKey)).toBeNull();
    expect(await sealBytes(secret, wrapKey)).not.toBe(sealed);
  });
});

describe('recovery codes', () => {
  it('are six groups of five and are typed back in any case', async () => {
    const code = await newRecoveryCode();
    expect(code).toMatch(/^([A-HJKMNP-Z2-9]{5}-){5}[A-HJKMNP-Z2-9]{5}$/);
    expect(await newRecoveryCode()).not.toBe(code);
    const typed = ` ${code.toLowerCase().replaceAll('-', ' ')} `;
    expect(normaliseRecoveryCode(typed)).toBe(code.replaceAll('-', ''));
    const key = await deriveRecoveryKey(code, SALT);
    expect(await deriveRecoveryKey(typed, SALT)).toEqual(key);
  });
});

describe('direct messages', () => {
  it('open for sender and recipient, and for nobody else', async () => {
    const [anna, ben, eve] = [await newKeyPair(), await newKeyPair(), await newKeyPair()];
    const payload = { text: 'secret-canary-123' };
    const sent = await encryptDirect(payload, ben.publicKey, anna.privateKey);
    expect(base64Length(sent.nonce)).toBe(24);
    expect(sent.ciphertext).not.toContain('secret');
    expect(await decryptDirect(sent, anna.publicKey, ben.privateKey)).toEqual(payload);
    expect(await decryptDirect(sent, ben.publicKey, anna.privateKey)).toEqual(payload);
    expect(await decryptDirect(sent, anna.publicKey, eve.privateKey)).toBeNull();
    const again = await encryptDirect(payload, ben.publicKey, anna.privateKey);
    expect(again.nonce).not.toBe(sent.nonce);
  });
});

describe('shape checks', () => {
  it('accept exact and bounded base64 only', () => {
    expect(base64Length('AAAA')).toBe(3);
    expect(base64Length('AA==')).toBe(1);
    expect(base64Length('AAA')).toBe(-1);
    expect(base64Length('AA*=')).toBe(-1);
    expect(exactBytes('Salt', 16)(SALT)).toBeNull();
    expect(exactBytes('Salt', 16)('AAAA')).toBe('Salt is malformed.');
    expect(boundedBase64('Box', 8)('AAAA')).toBeNull();
    expect(boundedBase64('Box', 3)('AAAA')).toBe('Box is malformed.');
    expect(boundedBase64('Box', 8)('')).toBe('Box is malformed.');
  });
});
