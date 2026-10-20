// ============================================================
// File:        safetyStore.js
// Path:        client/src/chat/safetyStore.js
// Project:     Seasonal Entertainment
// Description: What this device remembers about a direct conversation's keys (docs/CHAT.md,
//              "Safety numbers"), per signed-in member and partner, in this browser's storage
//              (never sent to the server): the safety number the member marked as verified,
//              and the partner's key id last seen here (trust on first use). Another device
//              of the same member keeps its own.
// ============================================================

import { readStored, writeStored } from '../app/storage.js';

const verifiedEntry = (meId, partnerId) => `se.dm.verified.${meId}.${partnerId}`;
const seenEntry = (meId, partnerId) => `se.dm.seenKey.${meId}.${partnerId}`;

// number: the safety number's groups. Verified only for exactly this number: a new key on
// either side makes another number, which is not verified.
export const isVerified = (meId, partnerId, number) =>
  readStored(verifiedEntry(meId, partnerId)) === number.join(' ');

// number: the groups to mark as verified, or null to remove the mark.
export function setVerified(meId, partnerId, number) {
  writeStored(verifiedEntry(meId, partnerId), number ? number.join(' ') : null);
}

// Remembers the partner's current key id; true when this device had seen another one before.
// Then the verified mark goes too (the member must compare again).
export function partnerKeyChanged(meId, partnerId, keyId) {
  const seen = readStored(seenEntry(meId, partnerId));
  writeStored(seenEntry(meId, partnerId), String(keyId));
  const changed = seen !== null && seen !== String(keyId);
  if (changed) setVerified(meId, partnerId, null);
  return changed;
}
