// ============================================================
// File:        ChangePasswordForm.jsx
// Path:        client/src/components/ChangePasswordForm.jsx
// Project:     Seasonal Entertainment
// Description: Own password change (current + new). Neither password leaves the browser: the
//              current one is proven by its auth key, the new one sent as a new salt and auth
//              key (session/credentials.js). The server ends all other sessions.
// ============================================================

import { useState } from 'react';
import { PASSWORD_MIN, validatePassword } from '@seasonal-entertainment/shared/accountRules.js';
import { api } from '../api/http.js';
import { keysForNewPassword, keysForPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';
import { FormField, FormMessage } from './FormField.jsx';

export default function ChangePasswordForm() {
  const { user } = useSession();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = form.get('newPassword');
    setNotice(null);
    const problem = validatePassword(newPassword);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const current = await keysForPassword(user.username, form.get('currentPassword'));
      const next = await keysForNewPassword(newPassword);
      const body = {
        currentAuthKey: current.authKey,
        newSalt: next.salt,
        newAuthKey: next.authKey,
      };
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
