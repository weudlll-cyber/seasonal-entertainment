// ============================================================
// File:        crypto.js
// Path:        shared/crypto.js
// Project:     Seasonal Entertainment
// Description: The one cryptography helper of the project, on libsodium (libsodium-wrappers-
//              sumo, exact version pinned). Used by the browser, the server tests and the
//              scripts; no home-made cryptography anywhere else. Covers: the login key split
//              (password -> Argon2id master key -> auth key + wrapping key), sealing a private
//              key, the optional recovery code, and encrypting direct messages (crypto_box).
//              Binary values travel as standard base64 (with padding).
// ============================================================

import sodiumModule from 'libsodium-wrappers-sumo';
import { SALT_BYTES } from './cryptoFormat.js';

const sodium = sodiumModule.default ?? sodiumModule;
const KEY_BYTES = 32;
// libsodium's KDF context is exactly 8 bytes: "se-auth" and "se-wrap" as C strings, i.e. with
// their terminating NUL byte.
const AUTH_CONTEXT = 'se-auth\0';
const WRAP_CONTEXT = 'se-wrap\0';
// Recovery code: 6 groups of 5 characters from an alphabet without look-alikes (0/O, 1/I/L):
// 30 characters of 5 bits each, 150 bits of randomness.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_GROUPS = 6;
const CODE_GROUP_LENGTH = 5;

// Every function waits for the WebAssembly module itself, so callers never have to.
const ready = () => sodium.ready;
const b64 = (bytes) => sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
const unb64 = (text) => sodium.from_base64(text, sodium.base64_variants.ORIGINAL);

// Argon2id with the interactive limits (about 64 MiB of memory per derivation).
function pwhash(secret, saltBase64) {
  return sodium.crypto_pwhash(
    KEY_BYTES,
    secret,
    unb64(saltBase64),
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

// A new random salt for an account's password or a recovery code.
export async function newSalt() {
  await ready();
  return b64(sodium.randombytes_buf(SALT_BYTES));
}

// The login key split. Only authKey (base64) ever goes to the server; wrapKey stays in the
// browser and seals the private key. The password and the master key are never kept.
export async function deriveAccountKeys(password, saltBase64) {
  await ready();
  const master = pwhash(password, saltBase64);
  const authKey = sodium.crypto_kdf_derive_from_key(KEY_BYTES, 1, AUTH_CONTEXT, master);
  const wrapKey = sodium.crypto_kdf_derive_from_key(KEY_BYTES, 2, WRAP_CONTEXT, master);
  sodium.memzero(master);
  return { authKey: b64(authKey), wrapKey };
}

// secretbox with a fresh random nonce; the result is base64(nonce + ciphertext).
export async function sealBytes(bytes, key) {
  await ready();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const box = sodium.crypto_secretbox_easy(bytes, nonce, key);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return b64(out);
}

// The bytes, or null when the key does not open the seal (or the seal is malformed).
export async function openSealed(sealedBase64, key) {
  await ready();
  try {
    const all = unb64(sealedBase64);
    const nonce = all.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
    const box = all.subarray(sodium.crypto_secretbox_NONCEBYTES);
    return sodium.crypto_secretbox_open_easy(box, nonce, key);
  } catch {
    return null;
  }
}

// An X25519 key pair for direct messages: the public key as base64, the private key as bytes.
export async function newKeyPair() {
  await ready();
  const pair = sodium.crypto_box_keypair();
  return { publicKey: b64(pair.publicKey), privateKey: pair.privateKey };
}

export async function newRecoveryCode() {
  await ready();
  const groups = [];
  for (let g = 0; g < CODE_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < CODE_GROUP_LENGTH; i += 1) {
      group += CODE_ALPHABET[sodium.randombytes_uniform(CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// Typed back by a person: case, spaces and hyphens do not matter.
export const normaliseRecoveryCode = (code) => String(code).toUpperCase().replace(/[\s-]/g, '');

export async function deriveRecoveryKey(code, saltBase64) {
  await ready();
  return pwhash(normaliseRecoveryCode(code), saltBase64);
}

// A direct message: crypto_box_easy of the JSON payload with a fresh random nonce.
export async function encryptDirect(payload, recipientPublicKey, senderPrivateKey) {
  await ready();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const box = sodium.crypto_box_easy(
    JSON.stringify(payload),
    nonce,
    unb64(recipientPublicKey),
    senderPrivateKey
  );
  return { nonce: b64(nonce), ciphertext: b64(box) };
}

// Either side opens it with the other side's public key and its own private key (the box
// key is shared). null when it does not open.
export async function decryptDirect({ nonce, ciphertext }, partnerPublicKey, ownPrivateKey) {
  await ready();
  try {
    const text = sodium.crypto_box_open_easy(
      unb64(ciphertext),
      unb64(nonce),
      unb64(partnerPublicKey),
      ownPrivateKey,
      'text'
    );
    return JSON.parse(text);
  } catch {
    return null;
  }
}
