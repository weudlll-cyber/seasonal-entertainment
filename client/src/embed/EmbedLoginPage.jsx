// ============================================================
// File:        EmbedLoginPage.jsx
// Path:        client/src/embed/EmbedLoginPage.jsx
// Project:     Seasonal Entertainment
// Description: The login popup of the chat embedded on an approved foreign site
//              (/embed-login?origin=<site>; docs/EMBED.md). A window of its own on this site,
//              its address visible: logging in is the normal login (2FA included); signed in,
//              it names the site asking and asks for the password, which opens the private key
//              here (the same derivation as everywhere, session/credentials.js). Then it asks
//              the server for an embed token for that site and hands token, account and key to
//              its opener — the embed, on this same origin — and closes. It refuses a site not
//              on the list and an opener that is not this site's embed.
// ============================================================

import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { api } from '../api/http.js';
import { BusyButton } from '../components/BusyButton.jsx';
import { FormField, FormMessage } from '../components/FormField.jsx';
import { openWithPassword } from '../keys/keyActions.js';
import { keysForPassword } from '../session/credentials.js';
import { useSession } from '../session/SessionContext.jsx';
import { LOGIN_SOURCE } from './embedProtocol.js';
import './EmbedChat.css';

// The window that opened this one, if it is this site's own embed (cross-origin: null).
function ownOpener() {
  try {
    return window.opener?.location.origin === window.location.origin ? window.opener : null;
  } catch {
    return null;
  }
}

export default function EmbedLoginPage() {
  const [params] = useSearchParams();
  const origin = params.get('origin');
  const location = useLocation();
  const { user } = useSession();
  const [approved, setApproved] = useState(undefined); // undefined while asking the server
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/embed/check?origin=${encodeURIComponent(origin ?? '')}`)
      .then((data) => setApproved(data.allowed))
      .catch(() => setApproved(false));
  }, [origin]);

  // password: unlocks private messages first; null leaves them locked there.
  async function allow(password) {
    const opener = ownOpener();
    if (!opener) return setError('Open this window from the chat on the page you are visiting.');
    setBusy(true);
    setError(null);
    try {
      let key = null;
      if (password) {
        const opened = await openWithPassword(await keysForPassword(user.username, password));
        if (opened.status !== 'unlocked')
          throw new Error(
            'Your password no longer opens your private messages; open them on this site first.'
          );
        key = { keyId: opened.keyId, privateKey: opened.privateKey };
      }
      const { token, expiresAt } = await api('/embed/token', { method: 'POST', body: { origin } });
      // To this site's own window only: a page elsewhere never receives any of it.
      opener.postMessage(
        { source: LOGIN_SOURCE, type: 'login', origin, token, expiresAt, user, key },
        window.location.origin
      );
      window.close();
    } catch (err) {
      setError(err.status === 401 ? 'That password is not right.' : err.message);
      setBusy(false);
    }
  }

  const next = encodeURIComponent(location.pathname + location.search);
  return (
    <main className="embed-login">
      <h1>Chat on another site</h1>
      {approved === undefined || user === undefined ? (
        <p>Checking…</p>
      ) : !approved ? (
        <p role="alert">This site is not approved for the Seasonal Entertainment chat.</p>
      ) : !user ? (
        // A card like the Allow step: the text, then the button on its own line.
        <div className="form">
          <p>
            <strong>{origin}</strong> asks you to log in to the chat.
          </p>
          <Link className="button" to={`/login?next=${next}`}>
            Log in
          </Link>
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            allow(new FormData(event.currentTarget).get('password'));
          }}
        >
          <p>
            Chat on <strong>{origin}</strong> as <strong>{user.username}</strong>? Your password
            unlocks your private messages there until you close that page.
          </p>
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <FormMessage error={error} />
          <BusyButton busy={busy}>Allow</BusyButton>{' '}
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={() => allow(null)}
          >
            Allow without private messages
          </button>{' '}
          <button type="button" className="link-button" onClick={() => window.close()}>
            Cancel
          </button>
        </form>
      )}
    </main>
  );
}
