// ============================================================
// File:        PrivateMessagesSection.jsx
// Path:        client/src/keys/PrivateMessagesSection.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Private messages" section: whether they are unlocked on this
//              device (else the unlock panel), and the optional recovery code: "Create recovery
//              code" when there is none, "Create a new recovery code" (the old one stops
//              working) and "Remove recovery code" when there is one. All of these need the
//              key unlocked here (the code seals the private key, which only this browser has)
//              and the current password, which the server asks for (as its auth key).
// ============================================================

import { useState } from 'react';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { keysForPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';
import { useKeys } from './KeyContext.jsx';
import RecoveryCodeShown from './RecoveryCodeShown.jsx';
import { SKIP_WARNING } from './RecoveryOffer.jsx';
import UnlockPanel from './UnlockPanel.jsx';
import './Keys.css';

export default function PrivateMessagesSection() {
  const keys = useKeys();
  const { user } = useSession();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // work(authKey): a change to the recovery code, proven with the password typed here.
  async function act(work, done) {
    setError(null);
    setNotice(null);
    if (!password) return setError('Enter your password first.');
    try {
      const { authKey } = await keysForPassword(user.username, password);
      await work(authKey);
      setPassword('');
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
        <FormField
          label="Password for the recovery code"
          name="recoveryPassword"
          type="password"
          autoComplete="current-password"
          hint="Your account password: needed to create, replace or remove the code."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormMessage error={error} notice={notice} />
        <div className="modal__actions">
          <button
            type="button"
            className="button"
            onClick={() => act(async (authKey) => setCode(await keys.createRecoveryCode(authKey)))}
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
