// ============================================================
// File:        TwoFactorDisable.jsx
// Path:        client/src/components/TwoFactorDisable.jsx
// Project:     Seasonal Entertainment
// Description: Turning 2FA off: needs the password and a current code.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { FormField, FormMessage } from './FormField.jsx';

export default function TwoFactorDisable({ onDisabled }) {
  const [error, setError] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api('/2fa/disable', {
        method: 'POST',
        body: { password: form.get('password'), code: form.get('code') },
      });
      onDisabled();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
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
        Turn off two-factor authentication
      </button>
    </form>
  );
}
