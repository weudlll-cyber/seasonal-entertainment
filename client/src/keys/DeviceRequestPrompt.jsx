// ============================================================
// File:        DeviceRequestPrompt.jsx
// Path:        client/src/keys/DeviceRequestPrompt.jsx
// Project:     Seasonal Entertainment
// Description: On a device where private messages are unlocked: a new device of the same
//              member asks for the key (docs/AUTH.md, "Unlock on another device"). The request
//              arrives as a personal event ("keyRequest", keys/handover.js on the server); the
//              dialog shows the code computed here from the new device's one-time key, which
//              must match the code on the new device. Confirm seals the private key to that
//              one-time key (crypto_box_seal) — the server cannot open it; Reject sends nothing.
//              It closes by itself when the request expires. Devices without the key ignore it.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/http.js';
import { usePersonalEvents } from '../chat/index.js';
import { FormMessage } from '../components/FormField.jsx';
import { useKeys } from './KeyContext.jsx';
import './Keys.css';

const crypto = () => import('@seasonal-entertainment/shared/crypto.js');

export default function DeviceRequestPrompt() {
  const keys = useKeys();
  const [request, setRequest] = useState(null); // { id, publicKey, expiresAt, code }
  const [error, setError] = useState(null);
  const dialog = useRef(null);
  const unlocked = keys.status === 'unlocked';

  const onEvent = useCallback(
    async (event) => {
      if (event.type !== 'keyRequest' || !unlocked) return;
      const { handoverCode } = await crypto();
      setError(null);
      setRequest({ ...event, code: await handoverCode(event.publicKey) });
    },
    [unlocked]
  );
  usePersonalEvents(onEvent);

  // Gone with the request's 5 minutes.
  useEffect(() => {
    if (!request) return undefined;
    dialog.current?.focus();
    const timer = setTimeout(() => setRequest(null), Math.max(0, request.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [request]);

  if (!request || !unlocked) return null;

  async function answer(confirm) {
    try {
      if (confirm) {
        const { sealForDevice } = await crypto();
        const sealed = await sealForDevice(keys.privateKey, request.publicKey);
        await api(`/keys/handover/${request.id}/confirm`, { method: 'POST', body: { sealed } });
      } else {
        await api(`/keys/handover/${request.id}/reject`, { method: 'POST' });
      }
      setRequest(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <section
        ref={dialog}
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-request-title"
        tabIndex={-1}
        onKeyDown={(event) => event.key === 'Escape' && answer(false)}
      >
        <h2 id="device-request-title">A new device wants access</h2>
        <p>
          A new device wants access to your direct messages — code{' '}
          <strong className="device-code">{request.code}</strong>. Is this you?
        </p>
        <p className="form-field__hint">
          Confirm only if your new device shows the same code. Confirming gives it your key for
          private messages.
        </p>
        <FormMessage error={error} />
        <div className="modal__actions">
          <button type="button" className="button" onClick={() => answer(true)}>
            Confirm
          </button>
          <button type="button" className="button button--secondary" onClick={() => answer(false)}>
            Reject
          </button>
        </div>
      </section>
    </div>
  );
}
