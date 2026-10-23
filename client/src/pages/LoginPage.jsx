// ============================================================
// File:        LoginPage.jsx
// Path:        client/src/pages/LoginPage.jsx
// Project:     Seasonal Entertainment
// Description: Login form, with a second step (code or recovery code) for accounts with 2FA.
//              After success it returns to the page that sent the visitor here (?next=,
//              same-site paths only; session/nextPage.js) or to the account page; a member who
//              must still set up 2FA (the site requires it for everyone) goes to its setup
//              instead; the link to
//              the registration keeps ?next=. The password itself never leaves
//              the browser: only the auth key derived from it is sent (session/credentials.js).
//              Once logged in, the same derived keys open (or first create) the member's key
//              pair for private messages (keys/), before the page moves on. The card shows the
//              logo (FormLogo.jsx), except in the chat's login popup.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import FormLogo from '../brand/FormLogo.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import SecondFactorForm from '../components/SecondFactorForm.jsx';
import { useKeys } from '../keys/KeyContext.jsx';
import { logIn } from '../session/credentials.js';
import { inEmbedLoginFlow, safeNext, withNext } from '../session/nextPage.js';
import { useSession } from '../session/SessionContext.jsx';
import { BusyButton } from '../components/BusyButton.jsx';

export default function LoginPage() {
  const { setUser } = useSession();
  const keys = useKeys();
  // The password's keys, kept until the login is complete (after the 2FA step too).
  const passwordKeys = useRef(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  async function finish(user) {
    // A key problem must not block the login: the account page and the Direct tab offer
    // unlocking again.
    await keys.openWithPassword(passwordKeys.current, user.id).catch(() => {});
    passwordKeys.current = null;
    setUser(user);
    const setUp2fa = user.twoFactorRequired && !roleAtLeast(user.role, 'organiser');
    navigate(setUp2fa ? '/account#two-factor' : safeNext(params.get('next')), { replace: true });
  }

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await logIn(form.get('username'), form.get('password'));
      passwordKeys.current = result.passwordKeys;
      if (result.answer.twoFactorRequired) return setNeedsCode(true);
      await finish(result.answer.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (needsCode) {
    return (
      <section className="page">
        <h1>Login</h1>
        <p>This account uses two-factor authentication.</p>
        <SecondFactorForm onDone={finish} />
      </section>
    );
  }

  return (
    <section className="page">
      <h1>Login</h1>
      <form className="form" onSubmit={onSubmit}>
        {/* Not in the chat's small login popup: there the fields come first. */}
        {!inEmbedLoginFlow(params) && <FormLogo />}
        <FormField label="Username" name="username" type="text" autoComplete="username" required />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FormMessage error={error} />
        <BusyButton busy={busy}>Log in</BusyButton>
      </form>
      <p>
        No account yet? <Link to={withNext('/register', params.get('next'))}>Register</Link>
      </p>
    </section>
  );
}
