// ============================================================
// File:        ShareSwitch.jsx
// Path:        client/src/calls/ShareSwitch.jsx
// Project:     Seasonal Entertainment
// Description: The "Share with the games" switch of a planned or live call, for organisers and
//              admins (decided 2026-11-24 and 2026-11-25; docs/CALLS.md), on the call's card
//              (CallCard.jsx) and its page (pages/CallPage.jsx). It shows what the server has;
//              sharing while another call is shared asks whether to replace it.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import { replacingIfAsked } from './shareWithGames.js';

// call: { id, title, sharedWithGames }; onChanged(): after the server took a change.
export default function ShareSwitch({ call, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function set(shared) {
    setBusy(true);
    setError(null);
    try {
      const changed = await replacingIfAsked((replace) =>
        api(`/calls/${call.id}/shared`, {
          method: 'PUT',
          body: { shared, ...(replace && { replace }) },
        })
      );
      if (changed) onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="form-check">
        <input
          type="checkbox"
          checked={call.sharedWithGames}
          disabled={busy}
          aria-label={`Share ${call.title} with the games`}
          onChange={(event) => set(event.target.checked)}
        />
        <span>Share with the games</span>
      </label>
      <FormMessage error={error} />
    </div>
  );
}
