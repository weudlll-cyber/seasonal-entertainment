// ============================================================
// File:        DeleteAccountForm.jsx
// Path:        client/src/components/DeleteAccountForm.jsx
// Project:     Seasonal Entertainment
// Description: "Delete my account" on the account page (docs/AUTH.md, "Deleting an account"):
//              says in plain words what goes and what stays, then asks for the password (sent
//              as its auth key, session/credentials.js, never the password) and, with 2FA on, a
//              code from the app or a recovery code, and a ticked confirmation; an account
//              without a password (made with Discord) confirms with a fresh Discord login instead
//              (discord/DiscordConfirmGate.jsx), and its Discord link goes too. On success the
//              session is gone: the page becomes a guest's (which also clears the private key
//              kept on this device, keys/KeyContext.jsx) and goes home.
// ============================================================

import { startTransition, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api/http.js';
import DiscordConfirmGate from '../discord/DiscordConfirmGate.jsx';
import { keysForPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';
import { BusyButton } from './BusyButton.jsx';
import { FormField, FormMessage } from './FormField.jsx';

// A 6-digit code is the app's; anything else is taken as a recovery code ("abcd-efgh").
const secondFactor = (value) =>
  /^\d{6}$/.test(value.trim()) ? { code: value.trim() } : { recoveryCode: value };

export default function DeleteAccountForm() {
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      // Without a password, the session's fresh Discord login is the proof (no body).
      const body = user.hasPassword
        ? {
            authKey: (await keysForPassword(user.username, form.get('password'))).authKey,
            ...(user.twoFactorEnabled && secondFactor(String(form.get('factor')))),
          }
        : {};
      await api('/auth/account', { method: 'DELETE', body });
      // react-router navigates inside a transition: a plain setUser(null) would render first,
      // and the account page's guard would send the new guest to the login page instead.
      startTransition(() => {
        setUser(null);
        navigate('/', { replace: true });
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p>
        This deletes your account at once, and it cannot be undone. Gone with it: your login,
        two-factor authentication, keys and Discord link; every chat message you wrote and every
        file you sent; all your private conversations, for the other member too; your favourites,
        read marks, reports and call reminders.
      </p>
      <p>
        Kept: the admin and moderation log, and call recordings you are in; for 30 days a note that
        your account was deleted (your username and when), so that restoring an older backup deletes
        it again. Backups of the site keep deleted data for up to about 30 days; the privacy page
        has the details.
      </p>
      <DiscordConfirmGate what="delete your account">
        <form className="form" onSubmit={onSubmit}>
          {user.hasPassword && (
            <FormField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
          {user.twoFactorEnabled && (
            <FormField
              label="Code from the app, or a recovery code"
              name="factor"
              type="text"
              autoComplete="one-time-code"
              required
            />
          )}
          <label className="form-check">
            <input type="checkbox" name="understood" required />
            <span>
              I understand that my account and everything listed above is deleted for good.
            </span>
          </label>
          <FormMessage error={error} />
          <BusyButton busy={busy}>Delete my account</BusyButton>
        </form>
      </DiscordConfirmGate>
    </>
  );
}
