// ============================================================
// File:        DeviceUnlock.jsx
// Path:        client/src/keys/DeviceUnlock.jsx
// Project:     Seasonal Entertainment
// Description: "Confirm on another device" on a device without the private key (docs/AUTH.md,
//              "Unlock on another device"): makes a one-time key pair, asks the server to pass
//              the request to the member's unlocked devices, and shows the 6-digit code from
//              the one-time public key (the other device shows the same code). It then asks
//              every 2 seconds for the answer: a confirmed one carries the private key sealed
//              to the one-time key; it is opened here, checked against the account's public
//              key and kept like an unlocked key. Rejected or expired (5 minutes): nothing
//              changes, and the member may try again.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import { useKeys } from './KeyContext.jsx';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');
const POLL_MS = 2000;

// onCancel(): back to the other ways of unlocking.
export default function DeviceUnlock({ onCancel }) {
  const keys = useKeys();
  // { id, code, deviceKeys } while waiting; the outcome's text when it ended.
  const [waiting, setWaiting] = useState(null);
  const [error, setError] = useState(null);
  // The latest way to keep the key, without restarting the waiting when the context changes.
  const adopt = useRef(keys.fromOtherDevice);
  useEffect(() => {
    adopt.current = keys.fromOtherDevice;
  });

  async function start() {
    setError(null);
    try {
      const { newKeyPair, handoverCode } = await crypto();
      const deviceKeys = await newKeyPair();
      const { id } = await api('/keys/handover', {
        method: 'POST',
        body: { publicKey: deviceKeys.publicKey },
      });
      setWaiting({ id, code: await handoverCode(deviceKeys.publicKey), deviceKeys });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!waiting) return undefined;
    let active = true;
    const ask = async () => {
      try {
        const answer = await api(`/keys/handover/${waiting.id}`);
        if (!active) return;
        if (answer.status === 'pending') return void setTimeout(ask, POLL_MS);
        setWaiting(null);
        if (answer.status === 'rejected') return setError('Rejected on your other device.');
        const { openFromDevice, publicKeyOf } = await crypto();
        const privateKey = await openFromDevice(answer.sealed, waiting.deviceKeys);
        const key = await api('/keys/me');
        // Only the account's own key is kept: anything else is refused.
        if (!privateKey || (await publicKeyOf(privateKey)) !== key.key?.publicKey) {
          return setError('The key from your other device did not fit. Please try again.');
        }
        await adopt.current({ keyId: key.key.keyId, privateKey });
      } catch (err) {
        if (!active) return;
        setWaiting(null);
        setError(
          err instanceof ApiError && err.status === 404
            ? 'The request expired. Please try again.'
            : err.message
        );
      }
    };
    const first = setTimeout(ask, POLL_MS);
    return () => {
      active = false;
      clearTimeout(first);
    };
  }, [waiting]);

  if (waiting) {
    return (
      <div className="form" role="status">
        <p>
          On a device where your private messages are open, confirm this code:{' '}
          <strong className="device-code">{waiting.code}</strong>
        </p>
        <p className="form-field__hint">Waiting for your other device (up to 5 minutes)…</p>
      </div>
    );
  }
  return (
    <div className="form">
      <p>A device where your private messages are open can hand them to this one.</p>
      <FormMessage error={error} />
      <div className="modal__actions">
        <button type="button" className="button" onClick={start}>
          Ask my other device
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Back
        </button>
      </div>
    </div>
  );
}
