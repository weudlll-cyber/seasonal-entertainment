// ============================================================
// File:        PasswordlessKeys.jsx
// Path:        client/src/keys/PasswordlessKeys.jsx
// Project:     Seasonal Entertainment
// Description: Private messages for an account without a password (made with Discord;
//              docs/CHAT.md, "Accounts without a password"; decided 2026-11-02). Shown where a
//              password account would see the unlock panel (UnlockPanel.jsx hands over):
//              - no key yet (before the first private message): the plain choice "Save a
//                recovery code" or "Set a password" (typed twice, RepeatPasswordField.jsx).
//                One is enough; the other can be added on
//                the account page later. Both need a fresh Discord login (DiscordConfirmGate).
//                The new code is shown once by the recovery dialog (RecoveryOffer.jsx);
//              - a key that this device does not have open: the recovery code, or "Confirm on
//                another device" (DeviceUnlock), or start over with a new recovery code.
// ============================================================

import { PASSWORD_MIN, validatePassword } from '@seasonal-entertainment/shared/accountRules.js';
import { useState } from 'react';
import { BusyButton } from '../components/BusyButton.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { RepeatPasswordField, useRepeatPassword } from '../components/RepeatPasswordField.jsx';
import DiscordConfirmGate from '../discord/DiscordConfirmGate.jsx';
import { useSession } from '../session/SessionContext.jsx';
import DeviceUnlock from './DeviceUnlock.jsx';
import { useKeys } from './KeyContext.jsx';
import './Keys.css';

// work(): one try, its error shown; busy while it runs.
function useAttempt() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function attempt(work) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }
  return { error, setError, busy, attempt };
}

function ProtectionChoice() {
  const { refresh } = useSession();
  const keys = useKeys();
  const { error, setError, busy, attempt } = useAttempt();
  const repeat = useRepeatPassword('password');

  const withCode = () => attempt(() => keys.setUpWithRecoveryCode());
  const withPassword = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    const problem = validatePassword(password);
    if (problem) return setError(problem);
    setError(null);
    if (!repeat.matches(form)) return;
    return attempt(async () => {
      await keys.setUpWithPassword(password);
      await refresh(); // the account has a password now
    });
  };

  return (
    <DiscordConfirmGate what="protect your private messages">
      <div className="form">
        <p>
          Private messages are encrypted on your devices. Before your first one, choose how your key
          is protected, so you can open your messages on another device or after a logout. One is
          enough; you can add the other later on your account page.
        </p>
        <FormMessage error={error} />
        <p>
          <strong>Save a recovery code</strong>: a code shown once, that you keep safe.
        </p>
        <button className="button" type="button" disabled={busy} onClick={withCode}>
          {busy ? 'Checking…' : 'Save a recovery code'}
        </button>
      </div>
      <form className="form" onSubmit={withPassword} noValidate>
        <p>
          <strong>Set a password</strong>: it protects your key, and lets you log in without Discord
          too.
        </p>
        <FormField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN} characters.`}
        />
        <RepeatPasswordField {...repeat.fieldProps} />
        <BusyButton busy={busy}>Set a password</BusyButton>
      </form>
    </DiscordConfirmGate>
  );
}

function RecoveryUnlock() {
  const keys = useKeys();
  const { error, setError, busy, attempt } = useAttempt();
  const [onOtherDevice, setOnOtherDevice] = useState(false);

  const recover = (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    return attempt(async () => {
      if (!(await keys.recover(code, null))) setError('That recovery code is not right.');
    });
  };
  const startOver = () => attempt(() => keys.setUpWithRecoveryCode('replace'));

  if (onOtherDevice) return <DeviceUnlock onCancel={() => setOnOtherDevice(false)} />;
  return (
    <div className="unlock-broken">
      <form className="form" onSubmit={recover}>
        <p>Your recovery code unlocks your private messages on this device.</p>
        <FormField label="Recovery code" name="code" type="text" autoComplete="off" required />
        <FormMessage error={error} />
        <BusyButton busy={busy}>Use recovery code</BusyButton>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setOnOtherDevice(true)}
        >
          Confirm on another device
        </button>
      </form>
      <DiscordConfirmGate what="start over with a new key">
        <div className="form">
          <p>
            Or start over: you get a new key and a new recovery code, your earlier private messages
            can no longer be read by you, and the people you write with see that your key changed.
          </p>
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={startOver}
          >
            Start over without my old messages
          </button>
        </div>
      </DiscordConfirmGate>
    </div>
  );
}

export default function PasswordlessKeys() {
  return useKeys().hasKey ? <RecoveryUnlock /> : <ProtectionChoice />;
}
