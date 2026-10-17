// ============================================================
// File:        ChangePasswordForm.jsx
// Path:        client/src/components/ChangePasswordForm.jsx
// Project:     Seasonal Entertainment
// Description: Own password change (current + new). The server ends all other sessions.
// ============================================================

import { useState } from 'react';
import { PASSWORD_MIN, validatePassword } from '@seasonal-entertainment/shared/accountRules.js';
import { api } from '../api/http.js';
import { FormField, FormMessage } from './FormField.jsx';

export default function ChangePasswordForm() {
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
    };
    setNotice(null);
    const problem = validatePassword(body.newPassword);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password', { method: 'POST', body });
      formElement.reset();
      setNotice('Password changed. Other sessions have been logged out.');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <FormField
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
      />
      <FormField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN} characters.`}
      />
      <FormMessage error={error} notice={notice} />
      <button className="button" type="submit" disabled={busy}>
        Change password
      </button>
    </form>
  );
}
