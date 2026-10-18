// ============================================================
// File:        PrivateMessagesSection.jsx
// Path:        client/src/keys/PrivateMessagesSection.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Private messages" section: whether they are unlocked on this
//              device (else the unlock panel), and the optional recovery code: "Create recovery
//              code" when there is none, "Create a new recovery code" (the old one stops
//              working) and "Remove recovery code" when there is one. All of these need the
//              key unlocked here: the code seals the private key, which only this browser has.
// ============================================================

import { useState } from 'react';
import { FormMessage } from '../components/FormField.jsx';
import { useKeys } from './KeyContext.jsx';
import RecoveryCodeShown from './RecoveryCodeShown.jsx';
import { SKIP_WARNING } from './RecoveryOffer.jsx';
import UnlockPanel from './UnlockPanel.jsx';
import './Keys.css';

export default function PrivateMessagesSection() {
  const keys = useKeys();
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function act(work, done) {
    setError(null);
    setNotice(null);
    try {
      await work();
      if (done) setNotice(done);
    } catch (err) {
      setError(err.message);
    }
  }

  let body;
  if (keys.status === 'loading') body = <p>Checking…</p>;
  else if (keys.status !== 'unlocked') body = <UnlockPanel />;
  else if (code) body = <RecoveryCodeShown code={code} onDone={() => setCode(null)} />;
  else {
    body = (
      <>
        <p>Your private messages are unlocked on this device.</p>
        <p>
          {keys.hasRecovery
            ? 'You have a recovery code. A new one replaces it: the old code stops working.'
            : SKIP_WARNING}
        </p>
        <FormMessage error={error} notice={notice} />
        <div className="modal__actions">
          <button
            type="button"
            className="button"
            onClick={() => act(async () => setCode(await keys.createRecoveryCode()))}
          >
            {keys.hasRecovery ? 'Create a new recovery code' : 'Create recovery code'}
          </button>
          {keys.hasRecovery && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => act(keys.removeRecoveryCode, 'Recovery code removed.')}
            >
              Remove recovery code
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby="private-messages">
      <h2 id="private-messages">Private messages</h2>
      {body}
    </section>
  );
}
