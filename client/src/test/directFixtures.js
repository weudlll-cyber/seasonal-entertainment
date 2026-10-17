// ============================================================
// File:        directFixtures.js
// Path:        client/src/test/directFixtures.js
// Project:     Seasonal Entertainment
// Description: Test helper for direct messages: a message as the server stores it, really
//              encrypted with the project's crypto helper by one key pair for another.
// ============================================================

import { encryptDirect } from '@seasonal-entertainment/shared/crypto.js';

// from: { id, pair, keyId } (pair: { publicKey, privateKey }); to: { id, publicKey, keyId }.
export async function storedDirect(id, from, to, payload) {
  const box = await encryptDirect(payload, to.publicKey, from.pair.privateKey);
  return {
    id,
    senderId: from.id,
    recipientId: to.id,
    senderKeyId: from.keyId,
    recipientKeyId: to.keyId,
    ...box,
    createdAt: '2026-10-18T09:00:00.000Z',
  };
}
