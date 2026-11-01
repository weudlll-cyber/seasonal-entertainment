// ============================================================
// File:        ManageEventsPage.jsx
// Path:        client/src/pages/ManageEventsPage.jsx
// Project:     Seasonal Entertainment
// Description: Manage events (/manage-events), for organisers and admins: the event bot's own
//              admin page (/bot-admin/, same origin, behind the host's nginx and the site's
//              /api/bot-admin/authorize; docs/BOTS.md) in a frame filling the content area. It
//              asks /bot-admin/health first (and again on Retry); without an OK it says so
//              instead of showing a broken frame. Staff who still need 2FA are led to set it up;
//              on a server not set up for it (features.botAdmin off) the page says so and asks
//              nothing: /bot-admin/ would then be this site's own page fallback.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import './ManageEventsPage.css';

const BOT_ADMIN_PATH = '/bot-admin/';
// A health check that hangs counts as no answer.
const HEALTH_TIMEOUT_MS = 10_000;

// true when the bot's admin page answers OK through the site's nginx (and its authorize step).
async function botAdminAnswers() {
  try {
    const res = await fetch(`${BOT_ADMIN_PATH}health`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function ManageEventsPage() {
  const { user, features } = useSession();
  // 'checking' | 'up' | 'down'
  const [state, setState] = useState('checking');
  // Nothing to ask: the server refuses staff without 2FA (the frame would only show nginx's
  // 403), and without the feature there is no bot page behind /bot-admin/.
  const blocked = user.twoFactorRequired || !features.botAdmin;

  // The state starts as 'checking'; only the answer sets it, never the effect itself.
  const probe = useCallback(() => botAdminAnswers().then((ok) => setState(ok ? 'up' : 'down')), []);

  useEffect(() => {
    if (!blocked) probe();
  }, [blocked, probe]);

  function retry() {
    setState('checking');
    probe();
  }

  return (
    <section className="manage-events">
      <h1>Manage events</h1>
      {!features.botAdmin && <p>The event bot's admin page is not set up on this site.</p>}
      {features.botAdmin && user.twoFactorRequired && (
        <p>
          Your role requires two-factor authentication.{' '}
          <Link to="/account#two-factor">Set it up</Link> to manage events.
        </p>
      )}
      {!blocked && state === 'checking' && <p role="status">Connecting to the event bot…</p>}
      {!blocked && state === 'down' && (
        <div className="manage-events__down">
          <FormMessage error="The event bot's admin page does not answer right now." />
          <button className="button" type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {/* No sandbox: the bot's page is same-origin and needs scripts, its own requests and
          forms, so a sandbox would have to allow all three and with them protect nothing,
          while it would still break the bot's confirm dialogs and downloads. */}
      {!blocked && state === 'up' && (
        <iframe className="manage-events__frame" src={BOT_ADMIN_PATH} title="Event bot admin" />
      )}
    </section>
  );
}
