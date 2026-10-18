// ============================================================
// File:        PrivacySettings.jsx
// Path:        client/src/components/PrivacySettings.jsx
// Project:     Seasonal Entertainment
// Description: The account page's "Privacy" section: the switch "Show when I'm online" (on by
//              default). Off, others see this member as offline everywhere in the chat; the
//              server enforces it. The member's own view of others does not change.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import { FormMessage } from './FormField.jsx';

export default function PrivacySettings() {
  const { user, refresh } = useSession();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function change(event) {
    const showOnline = event.target.checked;
    setBusy(true);
    setError(null);
    try {
      await api('/auth/privacy', { method: 'PUT', body: { showOnline } });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

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
          onChange={change}
        />
        <span>Show when I&apos;m online</span>
      </label>
      <p className="form-field__hint">
        When this is off, other members see you as offline in the chat. You still see who is online.
      </p>
      <FormMessage error={error} />
    </section>
  );
}
