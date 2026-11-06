// ============================================================
// File:        LoginPage.jsx
// Path:        client/src/pages/LoginPage.jsx
// Project:     Seasonal Entertainment
// Description: Login form, with a second step (code or recovery code) for accounts with 2FA.
//              After success it returns to the page that sent the visitor here (?next=,
//              same-site paths only, an embedded game's page with a full page load;
//              session/nextPage.js goToNext) or to the account page; a member who must still set
//              up 2FA (the site requires it for everyone) goes to its setup instead; the link to
//              the registration keeps ?next=. The password itself never leaves
//              the browser: only the auth key derived from it is sent (session/credentials.js).
//              Once logged in, the same derived keys open (or first create) the member's key
//              pair for private messages (keys/), before the page moves on. The card shows the
//              logo (FormLogo.jsx), except in the chat's login popup. While Discord login is set
//              up, "Log in with Discord" comes first (docs/AUTH.md, "Discord"); coming back from
//              it, ?discord= says what went wrong, or (2fa) that the account's second step is
//              due, which then shows right away.
// ============================================================

import { roleAtLeast } from '@seasonal-entertainment/shared/accountRules.js';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import FormLogo from '../brand/FormLogo.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import SecondFactorForm from '../components/SecondFactorForm.jsx';
import { useKeys } from '../keys/KeyContext.jsx';
import { logIn } from '../session/credentials.js';
import { goToNext, inEmbedLoginFlow, withNext } from '../session/nextPage.js';
import { useSession } from '../session/SessionContext.jsx';
import { BusyButton } from '../components/BusyButton.jsx';
import DiscordButton from '../discord/DiscordButton.jsx';
import DiscordReason from '../discord/DiscordReason.jsx';

export default function LoginPage() {
  const { setUser, features } = useSession();
  const keys = useKeys();
  // The password's keys, kept until the login is complete (after the 2FA step too).
  const passwordKeys = useRef(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // A Discord login of an account with 2FA comes back here for the second step.
  const [needsCode, setNeedsCode] = useState(params.get('discord') === '2fa');

  async function finish(user) {
    // A key problem must not block the login: the account page and the Direct tab offer
    // unlocking again. After a Discord login there is no password to open it with.
    if (passwordKeys.current) {
      await keys.openWithPassword(passwordKeys.current, user.id).catch(() => {});
    }
    passwordKeys.current = null;
    setUser(user);
    const setUp2fa = user.twoFactorRequired && !roleAtLeast(user.role, 'organiser');
    if (setUp2fa) navigate('/account#two-factor', { replace: true });
    else goToNext(navigate, params.get('next'));
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

  // Not in the chat's login popup on other sites: it hands over a password's keys (embed/).
  const discord = features.discord && !inEmbedLoginFlow(params);
  return (
    <section className="page">
      <h1>Login</h1>
      <form className="form" onSubmit={onSubmit}>
        {/* Not in the chat's small login popup: there the fields come first. */}
        {!inEmbedLoginFlow(params) && <FormLogo />}
        <DiscordReason />
        {discord && (
          <>
            <DiscordButton intent="login" next={params.get('next') ?? undefined}>
              Log in with Discord
            </DiscordButton>
            <p className="discord-or">or with your password</p>
          </>
        )}
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
