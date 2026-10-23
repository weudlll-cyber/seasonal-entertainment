// ============================================================
// File:        RegisterPage.jsx
// Path:        client/src/pages/RegisterPage.jsx
// Project:     Seasonal Entertainment
// Description: Registration: username, email, password and the required age confirmation.
//              Checks the shared rules before sending; the server checks them again, except the
//              password rules: the password never leaves the browser, only a salt and the auth
//              key derived from it are sent (session/credentials.js). The new member's key pair
//              for private messages is made right away (keys/), and the recovery code offered.
//              Afterwards it returns to the page that sent the visitor (?next=, e.g. the
//              embedded chat's login popup), like the login page (session/nextPage.js). The card
//              shows the logo (FormLogo.jsx), except in the chat's login popup. While the
//              "Registration open" setting is off, the page says registration is closed.
// ============================================================

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import FormLogo from '../brand/FormLogo.jsx';
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
import { inEmbedLoginFlow, safeNext, withNext } from '../session/nextPage.js';
import { useSession } from '../session/SessionContext.jsx';
import { BusyButton } from '../components/BusyButton.jsx';

export default function RegisterPage() {
  const { setUser, settings } = useSession();
  const keys = useKeys();
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
      // Back where the visitor came from (e.g. the embedded chat's login popup), as after login.
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const logIn = (
    <p>
      Already registered? <Link to={withNext('/login', params.get('next'))}>Log in</Link>
    </p>
  );
  if (!settings['accounts.registrationOpen']) {
    return (
      <section className="page">
        <h1>Register</h1>
        <p className="banner" role="status">
          Registration is closed at the moment.
        </p>
        {logIn}
      </section>
    );
  }

  return (
    <section className="page">
      <h1>Register</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        {/* Not in the chat's small login popup: there the fields come first. */}
        {!inEmbedLoginFlow(params) && <FormLogo />}
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
        <BusyButton busy={busy}>Create account</BusyButton>
      </form>
      {logIn}
    </section>
  );
}
