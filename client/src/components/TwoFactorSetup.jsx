// ============================================================
// File:        TwoFactorSetup.jsx
// Path:        client/src/components/TwoFactorSetup.jsx
// Project:     Seasonal Entertainment
// Description: Turning 2FA on: the current password starts it (the server asks for it), then
//              show the QR code and secret, confirm with a first code, then show the recovery
//              codes once (they are stored hashed and never shown again).
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { FormField, FormMessage } from './FormField.jsx';

export default function TwoFactorSetup({ onEnabled }) {
  const [setup, setSetup] = useState(null); // { secret, qrCode } once started
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState(null);

  async function start(event) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    setError(null);
    try {
      setSetup(await api('/2fa/setup', { method: 'POST', body: { password } }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setError(null);
    try {
      const answer = await api('/2fa/enable', { method: 'POST', body: { code } });
      setRecoveryCodes(answer.recoveryCodes);
    } catch (err) {
      setError(err.message);
    }
  }

  if (recoveryCodes) {
    return (
      <div>
        <p>
          Two-factor authentication is on. Save these recovery codes somewhere safe. Each works once
          if you lose your phone. <strong>They will not be shown again.</strong>
        </p>
        <ul className="recovery-codes">
          {recoveryCodes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>
        <button className="button" type="button" onClick={onEnabled}>
          I have saved the codes
        </button>
      </div>
    );
  }

  if (!setup) {
    return (
      <form className="form" onSubmit={start}>
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormMessage error={error} />
        <button className="button" type="submit">
          Set up two-factor authentication
        </button>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={confirm}>
      <p>Scan this code with an authenticator app, or enter the secret by hand.</p>
      <img className="qr-code" src={setup.qrCode} alt="QR code for your authenticator app" />
      <p>
        Secret: <code>{setup.secret}</code>
      </p>
      <FormField
        label="Code from the app"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
      />
      <FormMessage error={error} />
      <button className="button" type="submit">
        Turn on
      </button>
    </form>
  );
}
