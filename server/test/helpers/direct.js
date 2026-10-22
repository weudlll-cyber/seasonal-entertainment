// ============================================================
// File:        direct.js
// Path:        server/test/helpers/direct.js
// Project:     Seasonal Entertainment
// Description: Direct-message test helpers, the browser's part done with the project's crypto
//              helper: send a payload encrypted for the partner's current key, and read a
//              conversation back, decrypted with the reader's private key.
// ============================================================

import { decryptDirect, encryptDirect } from '@seasonal-entertainment/shared/crypto.js';

// from: a member from memberWithKey (helpers/keys.js); to: the partner's account { id };
// extra: more body fields (fileId). Returns the API response.
export async function sendDirect(from, to, payload, extra = {}) {
  const { partnerKey } = (await from.agent.get(`/api/chat/direct/${to.id}`)).body;
  const box = await encryptDirect(payload, partnerKey.publicKey, from.pair.privateKey);
  return from.agent
    .post(`/api/chat/direct/${to.id}`)
    .send({ ...box, senderKeyId: from.keyId, recipientKeyId: partnerKey.keyId, ...extra });
}

// The conversation of `reader` with `partner`, each message decrypted (payload, or null when
// it does not open), plus the raw response body.
export async function readDirect(reader, partner) {
  const body = (await reader.agent.get(`/api/chat/direct/${partner.id}`)).body;
  const messages = [];
  for (const m of body.messages) {
    const partnerKeyId = m.senderId === partner.id ? m.senderKeyId : m.recipientKeyId;
    const payload = await decryptDirect(m, body.keys[partnerKeyId], reader.pair.privateKey);
    messages.push({ ...m, payload });
  }
  return { body, messages };
}
