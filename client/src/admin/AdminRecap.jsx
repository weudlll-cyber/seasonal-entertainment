// ============================================================
// File:        AdminRecap.jsx
// Path:        client/src/admin/AdminRecap.jsx
// Project:     Seasonal Entertainment
// Description: The admin chat page's "Weekly recap" (docs/CHAT.md, "Weekly recap"): the site
//              posts it every Monday from 09:00 Vienna time; "Post recap now" posts one at once
//              to try it out (POST /api/admin/recap, audited). It does not replace Monday's.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';

export default function AdminRecap() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  async function postNow() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { message } = await api('/admin/recap', { method: 'POST' });
      setNotice(`Posted in "${message.room}".`);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <>
      <h3>Weekly recap</h3>
      <p>
        Posted by the site every Monday from 09:00 Vienna time in Announcements: the week&apos;s
        price changes, the next 7 days&apos; events and calls, and new call recordings.
      </p>
      <p>
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          onClick={postNow}
        >
          Post recap now
        </button>
      </p>
      <FormMessage error={error} notice={notice} />
    </>
  );
}
