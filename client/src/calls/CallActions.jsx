// ============================================================
// File:        CallActions.jsx
// Path:        client/src/calls/CallActions.jsx
// Project:     Seasonal Entertainment
// Description: The actions beside a planned call (docs/CALLS.md), on the Calls page and in the
//              home page's "Next call" box: "Add to calendar" for everyone (the call's .ics file
//              from the server) and, for signed-in members only, "Remind me on this site" (a
//              toggle: the server then tells the member's open pages 10 minutes before and when
//              the call goes live; CallNotices.jsx). In a narrow box (compact: the home page's
//              Next call) both are round icon buttons side by side — calendar and bell — with
//              the same names as accessible names and tooltips.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import Icon from '../app/icons.jsx';
import { useSession } from '../session/SessionContext.jsx';
import './calls.css';

// call: from GET /api/calls; reminded: whether this member has a reminder for it (the list's
// `reminders`); compact: icon buttons for a narrow box (both fit in one row at 1280 x 720).
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
  const look = compact ? 'icon-button' : 'button button--secondary';
  const remindText = on ? 'Reminder on' : 'Remind me on this site';
  return (
    <p className="call-actions">
      {/* Only a call with a planned time has something to put in a calendar. */}
      {call.scheduledFor && (
        <a
          className={look}
          href={`/api/calls/${call.id}/calendar.ics`}
          download
          aria-label={`Add ${call.title} to calendar`}
          title="Add to calendar"
        >
          {compact ? <Icon name="events" /> : 'Add to calendar'}
        </a>
      )}
      {user && (
        <button
          type="button"
          className={look}
          aria-pressed={on}
          aria-label={`Remind me of ${call.title} on this site`}
          title={remindText}
          disabled={busy}
          onClick={toggle}
        >
          {compact ? <Icon name="bell" filled={on} /> : remindText}
        </button>
      )}
    </p>
  );
}
