// ============================================================
// File:        DiscordSection.jsx
// Path:        client/src/discord/DiscordSection.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Discord" section (docs/AUTH.md, "Discord"), while Discord
//              login is set up: not linked: "Link Discord"; linked: the Discord name, the steps
//              read from the Seasonal Tokens server with their full names (or why there are
//              none: not on the server, or the link needs a Discord login again), when they
//              were last read, and "Unlink Discord" (with the password; an account without one
//              is told to set one first, as it could not log in otherwise). Steps never give
//              rights on this site.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { BusyButton } from '../components/BusyButton.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { formatWhen } from '../app/dates.js';
import { keysForPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';
import DiscordButton from './DiscordButton.jsx';
import DiscordReason from './DiscordReason.jsx';
import { StepList } from '../chat/index.js';
import './Discord.css';

const STATUS_TEXT = {
  not_member:
    'You are not a member of the Seasonal Tokens Discord server, so no steps are shown. Join it and log in with Discord again.',
  needs_login:
    'Discord no longer accepts the link (it ends when unused for long, or when you remove the app in Discord). Log in with Discord again to show your steps.',
};

function Unlink() {
  const { user, refresh } = useSession();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    setBusy(true);
    setError(null);
    try {
      const { authKey } = await keysForPassword(user.username, password);
      await api('/auth/discord', { method: 'DELETE', body: { authKey } });
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!user.hasPassword) {
    return (
      <p>To unlink Discord, set a password first (below): without Discord, it is how you log in.</p>
    );
  }
  return (
    <form className="form" onSubmit={onSubmit}>
      <FormField
        label="Password to unlink Discord"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormMessage error={error} />
      <BusyButton busy={busy} className="button button--secondary">
        Unlink Discord
      </BusyButton>
    </form>
  );
}

export default function DiscordSection() {
  const { user, features } = useSession();
  if (!features.discord) return null;
  const link = user.discord;
  return (
    <section aria-labelledby="discord">
      <h2 id="discord">Discord</h2>
      <DiscordReason />
      {!link ? (
        <>
          <p>
            Link your Discord account to show your steps from the Seasonal Tokens server next to
            your name, and to log in with Discord. Only your Discord id and your roles on that
            server are read.
          </p>
          <DiscordButton intent="link" next="/account">
            Link Discord
          </DiscordButton>
        </>
      ) : (
        <>
          <p>
            Linked as <strong>{link.name}</strong>. Your steps come from the Seasonal Tokens Discord
            server and are read again at every login and once a day. They never give rights on this
            site.
          </p>
          {link.status === 'member' ? (
            <StepList steps={link.steps} empty="No steps yet." />
          ) : (
            <p>{STATUS_TEXT[link.status]}</p>
          )}
          {link.refreshedAt && (
            <p className="form-field__hint">Last read: {formatWhen(link.refreshedAt)}</p>
          )}
          <div className="discord-section__actions">
            {link.status === 'needs_login' && (
              <DiscordButton intent="confirm" next="/account">
                Log in with Discord again
              </DiscordButton>
            )}
          </div>
          <Unlink />
        </>
      )}
    </section>
  );
}
