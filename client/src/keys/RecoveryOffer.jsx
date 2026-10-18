// ============================================================
// File:        RecoveryOffer.jsx
// Path:        client/src/keys/RecoveryOffer.jsx
// Project:     Seasonal Entertainment
// Description: Offered once, right after a member's key pair was made (registration, first
//              login with keys, starting over): "Create recovery code" or "Skip". Skipping
//              stores nothing and is not asked again automatically; the account page can make
//              one later. A modal dialog: focus moves in, Escape counts as "Skip".
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { FormMessage } from '../components/FormField.jsx';
import { useKeys } from './KeyContext.jsx';
import RecoveryCodeShown from './RecoveryCodeShown.jsx';
import './Keys.css';

export const SKIP_WARNING =
  'Without a recovery code, your private messages are lost if you forget your password.';

export default function RecoveryOffer() {
  const keys = useKeys();
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const dialog = useRef(null);

  useEffect(() => dialog.current?.focus(), []);

  async function create() {
    setError(null);
    try {
      setCode(await keys.createRecoveryCode());
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
        aria-labelledby="recovery-offer-title"
        tabIndex={-1}
        onKeyDown={(event) => event.key === 'Escape' && !code && keys.dismissRecoveryOffer()}
      >
        <h2 id="recovery-offer-title">Protect your private messages</h2>
        {code ? (
          <RecoveryCodeShown code={code} onDone={keys.dismissRecoveryOffer} />
        ) : (
          <>
            <p>
              Your private messages are encrypted with a key that only your password opens. A
              recovery code opens it too, if you ever forget your password.
            </p>
            <FormMessage error={error} />
            <div className="modal__actions">
              <button type="button" className="button" onClick={create}>
                Create recovery code
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={keys.dismissRecoveryOffer}
              >
                Skip
              </button>
            </div>
            <p className="form-field__hint">{SKIP_WARNING}</p>
          </>
        )}
      </section>
    </div>
  );
}
