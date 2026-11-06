// ============================================================
// File:        DiscordSignupPage.jsx
// Path:        client/src/pages/DiscordSignupPage.jsx
// Project:     Seasonal Entertainment
// Description: /register/discord: the last step of signing up with Discord (docs/AUTH.md,
//              "Discord"). Discord has confirmed who the visitor is; the server holds that for
//              15 minutes. Here they choose the username (offered: their Discord name made to fit
//              the site's rules, and free) and confirm their age, as on every registration. No
//              email and no password: they log in with Discord, and can set a password later on
//              the account page. Then on to the page they came from (?next=; a game's page with
//              a full page load, session/nextPage.js goToNext).
// ============================================================

import {
  MINIMUM_AGE,
  USERNAME_HINT,
  validateUsername,
} from '@seasonal-entertainment/shared/accountRules.js';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../api/http.js';
import FormLogo from '../brand/FormLogo.jsx';
import { BusyButton } from '../components/BusyButton.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { goToNext } from '../session/nextPage.js';
import { useSession } from '../session/SessionContext.jsx';

export default function DiscordSignupPage() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // undefined while loading, null when no sign-up is waiting, else { discordName, suggested }.
  const [signup, setSignup] = useState(undefined);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/discord/signup')
      .then(setSignup)
      .catch(() => setSignup(null));
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      username: form.get('username'),
      ageConfirmed: form.get('ageConfirmed') === 'on',
    };
    const problem =
      validateUsername(body.username) ??
      (body.ageConfirmed ? null : `Please confirm that you are at least ${MINIMUM_AGE}.`);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api('/auth/discord/register', { method: 'POST', body });
      await refresh();
      goToNext(navigate, params.get('next'));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (signup === undefined) return <section className="page" aria-busy="true" />;
  if (signup === null) {
    return (
      <section className="page">
        <h1>Sign up with Discord</h1>
        <p>This sign-up has expired. Please start again.</p>
        <p>
          <Link to="/login">Back to the login</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>Sign up with Discord</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormLogo />
        <p>
          Discord confirmed you as <strong>{signup.discordName}</strong>. Choose your name on this
          site; you log in with Discord, and can add a password later on your account page.
        </p>
        <FormField
          label="Username"
          name="username"
          type="text"
          autoComplete="username"
          defaultValue={signup.suggested ?? ''}
          hint={USERNAME_HINT}
        />
        <label className="form-check">
          <input type="checkbox" name="ageConfirmed" />
          <span>I am at least {MINIMUM_AGE} years old.</span>
        </label>
        <FormMessage error={error} />
        <BusyButton busy={busy}>Create account</BusyButton>
      </form>
    </section>
  );
}
