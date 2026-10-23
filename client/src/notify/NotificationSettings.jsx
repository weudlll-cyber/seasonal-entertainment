// ============================================================
// File:        NotificationSettings.jsx
// Path:        client/src/notify/NotificationSettings.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Notifications" section (docs/CHAT.md, "Notifications"):
//              "Turn on notifications" asks the browser for permission (only on this press,
//              never on page load); when the browser blocks them, how to allow them there; and
//              the three switches, off until the member turns them on: mentions, new direct
//              messages (never their text), and the weekly recap being out (Mondays). Only
//              while the site is open in a tab.
// ============================================================

import { useState } from 'react';
import { FormMessage } from '../components/FormField.jsx';
import { useSession } from '../session/SessionContext.jsx';
import { notificationsSupported, permission } from './systemNotify.js';
import { saveNotificationSwitches, turnOnNotifications } from './turnOn.js';

export const BLOCKED_HELP =
  'Your browser blocks notifications from this site. To allow them, open the site settings ' +
  '(the icon left of the address), set Notifications to Allow, and reload the page.';

export default function NotificationSettings() {
  const { user, refresh } = useSession();
  const [allowed, setAllowed] = useState(permission);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(work) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const turnOn = () => run(async () => setAllowed(await turnOnNotifications(user, refresh)));
  const change = (name) => (event) => {
    const on = event.target.checked;
    return run(() => saveNotificationSwitches({ [name]: on }, refresh));
  };

  return (
    <section aria-labelledby="notifications">
      <h2 id="notifications">Notifications</h2>
      <p>
        Your browser can tell you about a mention, a new direct message or the weekly recap while
        this site is open in a tab you are not looking at. Not when the browser or every tab of the
        site is closed.
      </p>
      {!notificationsSupported() && <p>This browser cannot show notifications.</p>}
      {notificationsSupported() && allowed === 'denied' && <p role="status">{BLOCKED_HELP}</p>}
      {notificationsSupported() && allowed === 'granted' && (
        <p>Notifications are allowed in this browser.</p>
      )}
      {notificationsSupported() && allowed === 'default' && (
        <p>
          <button className="button" type="button" disabled={busy} onClick={turnOn}>
            Turn on notifications
          </button>
        </p>
      )}
      <label className="form-check">
        <input
          type="checkbox"
          role="switch"
          checked={Boolean(user.notifyMentions)}
          disabled={busy}
          onChange={change('notifyMentions')}
        />
        <span>When someone mentions me</span>
      </label>
      <label className="form-check">
        <input
          type="checkbox"
          role="switch"
          checked={Boolean(user.notifyDirect)}
          disabled={busy}
          onChange={change('notifyDirect')}
        />
        <span>New direct messages</span>
      </label>
      <label className="form-check">
        <input
          type="checkbox"
          role="switch"
          checked={Boolean(user.notifyRecap)}
          disabled={busy}
          onChange={change('notifyRecap')}
        />
        <span>Weekly recap</span>
      </label>
      <p className="form-field__hint">
        A direct message&apos;s notification says only who wrote, never the message.
      </p>
      <FormMessage error={error} />
    </section>
  );
}
