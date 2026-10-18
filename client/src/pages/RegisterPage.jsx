// ============================================================
// File:        RegisterPage.jsx
// Path:        client/src/pages/RegisterPage.jsx
// Project:     Seasonal Entertainment
// Description: Registration: username, email, password and the required age confirmation.
//              Checks the shared rules before sending; the server checks them again, except the
//              password rules: the password never leaves the browser, only a salt and the auth
//              key derived from it are sent (session/credentials.js). The new member's key pair
//              for private messages is made right away (keys/), and the recovery code offered.
// ============================================================

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  MINIMUM_AGE,
  PASSWORD_MIN,
  USERNAME_HINT,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';
import { api } from '../api/http.js';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { useKeys } from '../keys/KeyContext.jsx';
import { keysForNewPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';

export default function RegisterPage() {
  const { setUser } = useSession();
  const keys = useKeys();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      username: form.get('username'),
      email: form.get('email'),
      ageConfirmed: form.get('ageConfirmed') === 'on',
    };
    const password = form.get('password');
    const problem =
      validateUsername(input.username) ??
      validateEmail(input.email) ??
      validatePassword(password) ??
      (input.ageConfirmed ? null : `Please confirm that you are at least ${MINIMUM_AGE}.`);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const { salt, authKey, wrapKey } = await keysForNewPassword(password);
      const body = { ...input, salt, authKey };
      const { user } = await api('/auth/register', { method: 'POST', body });
      // A key problem must not block the new account: the account page offers it again.
      await keys.openWithPassword({ authKey, wrapKey }, user.id).catch(() => {});
      setUser(user);
      navigate('/account', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="page">
      <h1>Register</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormField
          label="Username"
          name="username"
          type="text"
          autoComplete="username"
          hint={USERNAME_HINT}
        />
        <FormField label="Email" name="email" type="email" autoComplete="email" />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
        />
        <label className="form-check">
          <input type="checkbox" name="ageConfirmed" />
          <span>I am at least {MINIMUM_AGE} years old.</span>
        </label>
        <FormMessage error={error} />
        <button className="button" type="submit" disabled={busy}>
          Create account
        </button>
      </form>
      <p>
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}
