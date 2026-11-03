// ============================================================
// File:        FirstPasswordForm.jsx
// Path:        client/src/discord/FirstPasswordForm.jsx
// Project:     Seasonal Entertainment
// Description: "Set a password" on the account page of an account made with Discord (it has
//              none; docs/AUTH.md, "Discord: accounts without a password"). After a fresh
//              Discord login (DiscordConfirmGate) the new password (typed twice,
//              RepeatPasswordField.jsx) is sent only as a salt and
//              auth key (session/credentials.js); it then logs the account in without Discord
//              too, allows unlinking Discord and two-factor authentication, and protects the
//              private-message key: the key open on this device is sealed for it at once
//              (keys/KeyContext.jsx, setUpWithPassword). Other sessions end, as after a
//              password change.
// ============================================================

import { PASSWORD_MIN, validatePassword } from '@seasonal-entertainment/shared/accountRules.js';
import { useState } from 'react';
import { BusyButton } from '../components/BusyButton.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { RepeatPasswordField, useRepeatPassword } from '../components/RepeatPasswordField.jsx';
import { useKeys } from '../keys/KeyContext.jsx';
import { useSession } from '../session/SessionContext.jsx';
import DiscordConfirmGate from './DiscordConfirmGate.jsx';

export default function FirstPasswordForm() {
  const { refresh } = useSession();
  const keys = useKeys();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const repeat = useRepeatPassword('password');

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const problem = validatePassword(password);
    if (problem) return setError(problem);
    setError(null);
    if (!repeat.matches(form)) return;
    setBusy(true);
    try {
      await keys.setUpWithPassword(password);
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p>
        Your account has no password: you log in with Discord. A password lets you log in without
        Discord too, unlink Discord, turn on two-factor authentication, and protects your private
        messages.
      </p>
      <DiscordConfirmGate what="set a password">
        <form className="form" onSubmit={onSubmit} noValidate>
          <FormField
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters.`}
          />
          <RepeatPasswordField {...repeat.fieldProps} />
          <FormMessage error={error} />
          <BusyButton busy={busy}>Set a password</BusyButton>
        </form>
      </DiscordConfirmGate>
    </>
  );
}
