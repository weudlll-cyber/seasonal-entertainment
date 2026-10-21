// ============================================================
// File:        useSafetyNumber.js
// Path:        client/src/chat/useSafetyNumber.js
// Project:     Seasonal Entertainment
// Description: A direct conversation's safety number (docs/CHAT.md, "Safety numbers"): made
//              in this browser from the member's own public key (from the private key) and the
//              partner's current one (shared/crypto.js, loaded when needed); whether this
//              device marked it as verified; and whether the partner's key changed since this
//              device last saw it (trust on first use), which also removes the mark.
// ============================================================

import { useEffect, useState } from 'react';
import { isVerified, partnerKeyChanged, setVerified } from './safetyStore.js';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

// meId: undefined while the session loads; partnerKey: { keyId, publicKey } or null (the
// partner has no key yet).
// Returns { number, verified, keyChanged, mark(), unmark() }; number is null until made.
export function useSafetyNumber(meId, partnerId, partnerKey, privateKey) {
  const [made, setMade] = useState(null); // { publicKey, number } for the partner key it is for
  const [keyChanged, setKeyChanged] = useState(false);
  const [, setVersion] = useState(0); // a render after the mark changed in storage
  const partnerKeyId = partnerKey?.keyId;
  const partnerPublicKey = partnerKey?.publicKey;

  useEffect(() => {
    if (meId === undefined || partnerKeyId === undefined) return;
    // Checked once per key the page gets to see: the notice stays while the page is open.
    if (partnerKeyChanged(meId, partnerId, partnerKeyId)) setKeyChanged(true);
  }, [meId, partnerId, partnerKeyId]);

  useEffect(() => {
    if (!partnerPublicKey || !privateKey) return undefined;
    let current = true;
    crypto().then(async ({ publicKeyOf, safetyNumber }) => {
      const number = await safetyNumber(await publicKeyOf(privateKey), partnerPublicKey);
      if (current) setMade({ publicKey: partnerPublicKey, number });
    });
    return () => {
      current = false;
    };
  }, [partnerPublicKey, privateKey]);

  // A number made for an earlier partner key is never shown for the new one.
  const number = made && made.publicKey === partnerPublicKey ? made.number : null;
  const change = (value) => {
    setVerified(meId, partnerId, value);
    setVersion((v) => v + 1);
  };
  return {
    number,
    verified: number !== null && meId !== undefined && isVerified(meId, partnerId, number),
    keyChanged,
    mark: () => {
      change(number);
      setKeyChanged(false);
    },
    unmark: () => change(null),
  };
}
