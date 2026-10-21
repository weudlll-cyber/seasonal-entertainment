// ============================================================
// File:        CallActions.jsx
// Path:        client/src/calls/CallActions.jsx
// Project:     Seasonal Entertainment
// Description: The actions beside a planned call (docs/CALLS.md), on the Calls page and in the
//              home page's "Next call" box: "Add to calendar" for everyone (the call's .ics file
//              from the server) and, for signed-in members only, "Remind me on this site" (a
//              toggle: the server then tells the member's open pages 10 minutes before and when
//              the call goes live; CallNotices.jsx).
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import { useSession } from '../session/SessionContext.jsx';
import './calls.css';

// call: from GET /api/calls; reminded: whether this member has a reminder for it (the list's
// `reminders`); compact: the short reminder text for a narrow box (the full one stays its
// accessible name).
export default function CallActions({ call, reminded = false, compact = false }) {
  const { user } = useSession();
  const [on, setOn] = useState(reminded);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api(`/calls/${call.id}/reminder`, { method: on ? 'DELETE' : 'PUT' });
      setOn(!on);
    } catch {
      // Unchanged: the button keeps showing the state the server has.
    } finally {
      setBusy(false);
    }
  }

  if (call.status !== 'scheduled') return null;
  return (
    <p className="call-actions">
      {/* Only a call with a planned time has something to put in a calendar. */}
      {call.scheduledFor && (
        <a
          className="button button--secondary"
          href={`/api/calls/${call.id}/calendar.ics`}
          download
          aria-label={`Add ${call.title} to calendar`}
        >
          Add to calendar
        </a>
      )}
      {user && (
        <button
          type="button"
          className="button button--secondary"
          aria-pressed={on}
          aria-label={`Remind me of ${call.title} on this site`}
          disabled={busy}
          onClick={toggle}
        >
          {on ? 'Reminder on' : compact ? 'Remind me' : 'Remind me on this site'}
        </button>
      )}
    </p>
  );
}
