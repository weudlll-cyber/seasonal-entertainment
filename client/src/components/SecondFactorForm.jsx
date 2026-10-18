// ============================================================
// File:        SecondFactorForm.jsx
// Path:        client/src/components/SecondFactorForm.jsx
// Project:     Seasonal Entertainment
// Description: Second login step for accounts with 2FA: the 6-digit code from the
//              authenticator app, or one of the recovery codes.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { FormField, FormMessage } from './FormField.jsx';

export default function SecondFactorForm({ onDone }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('factor');
    setBusy(true);
    setError(null);
    try {
      const body = useRecovery ? { recoveryCode: value } : { code: value };
      const { user } = await api('/2fa/login', { method: 'POST', body });
      onDone(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {useRecovery ? (
        <FormField label="Recovery code" name="factor" type="text" autoComplete="off" required />
      ) : (
        <FormField
          label="Authentication code"
          name="factor"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          hint="The 6-digit code from your authenticator app."
          required
        />
      )}
      <FormMessage error={error} />
      <button className="button" type="submit" disabled={busy}>
        Continue
      </button>
      <button className="link-button" type="button" onClick={() => setUseRecovery(!useRecovery)}>
        {useRecovery ? 'Use the authenticator code instead' : 'Use a recovery code instead'}
      </button>
    </form>
  );
}
