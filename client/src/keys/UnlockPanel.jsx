// ============================================================
// File:        UnlockPanel.jsx
// Path:        client/src/keys/UnlockPanel.jsx
// Project:     Seasonal Entertainment
// Description: "Unlock private messages" on a device that has no unlocked key (new device,
//              after logout): the account password opens the sealed private key (keys are
//              derived with the account's salt from the pre-login step). When the password no
//              longer opens it (an admin reset it, or it was forgotten and reset): the recovery
//              code, if one exists, and always "Start over without my old messages".
// ============================================================

import { useState } from 'react';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { keysForPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';
import { useKeys } from './KeyContext.jsx';

export default function UnlockPanel() {
  const { user } = useSession();
  const keys = useKeys();
  // The keys of the password typed last: recovery and start-over need them again.
  const [passwordKeys, setPasswordKeys] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function attempt(work) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const unlock = (event) => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    return attempt(async () => {
      const derived = await keysForPassword(user.username, password);
      setPasswordKeys(derived);
      const result = await keys.openWithPassword(derived);
      if (result.status === 'broken') {
        setError('Your password does not open your private messages any more.');
      }
    });
  };

  const recover = (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    return attempt(async () => {
      if (!(await keys.recover(code, passwordKeys))) setError('That recovery code is not right.');
    });
  };

  const startOver = () => attempt(() => keys.startOver(passwordKeys));

  if (keys.status !== 'broken' || !passwordKeys) {
    return (
      <form className="form" onSubmit={unlock}>
        <p>Enter your password to unlock your private messages on this device.</p>
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormMessage error={error} />
        <button className="button" type="submit" disabled={busy}>
          Unlock private messages
        </button>
      </form>
    );
  }

  return (
    <div className="unlock-broken">
      <FormMessage error={error} />
      {keys.hasRecovery && (
        <form className="form" onSubmit={recover}>
          <p>Your recovery code opens your private messages again.</p>
          <FormField label="Recovery code" name="code" type="text" autoComplete="off" required />
          <button className="button" type="submit" disabled={busy}>
            Use recovery code
          </button>
        </form>
      )}
      <div className="form">
        <p>
          Or start over: you get a new key, your earlier private messages can no longer be read by
          you, and the people you write with see that your key changed.
        </p>
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          onClick={startOver}
        >
          Start over without my old messages
        </button>
      </div>
    </div>
  );
}
