// ============================================================
// File:        PrivacySettings.jsx
// Path:        client/src/components/PrivacySettings.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Privacy" section, two switches, both on by default:
//              "Show when I'm online" (off: others see this member as offline everywhere in
//              the chat; the server enforces it; the member's own view of others does not
//              change) and "Link previews in direct messages" (off: this browser asks for no
//              preview at all while the member writes a direct message; docs/CHAT.md).
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { FormMessage } from './FormField.jsx';

export default function PrivacySettings() {
  const { user, refresh } = useSession();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // setting: 'showOnline' or 'dmLinkPreviews'.
  const change = (setting) => async (event) => {
    const on = event.target.checked;
    setBusy(true);
    setError(null);
    try {
      await api('/auth/privacy', { method: 'PUT', body: { [setting]: on } });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="privacy">
      <h2 id="privacy">Privacy</h2>
      <label className="form-check">
        <input
          type="checkbox"
          role="switch"
          // On unless the member switched it off.
          checked={user.showOnline !== false}
          disabled={busy}
          onChange={change('showOnline')}
        />
        <span>Show when I&apos;m online</span>
      </label>
      <p className="form-field__hint">
        When this is off, other members see you as offline in the chat. You still see who is online.
      </p>
      <label className="form-check">
        <input
          type="checkbox"
          role="switch"
          checked={user.dmLinkPreviews !== false}
          disabled={busy}
          onChange={change('dmLinkPreviews')}
        />
        <span>Link previews in direct messages</span>
      </label>
      <p className="form-field__hint">
        When you write a link in a private message, this site fetches a preview card for you
        (without keeping it or the link) and sends it encrypted with your message. The recipient
        never contacts the linked site. When this is off, no preview is asked for.
      </p>
      <FormMessage error={error} />
    </section>
  );
}
