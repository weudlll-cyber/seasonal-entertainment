// ============================================================
// File:        CallForm.jsx
// Path:        client/src/calls/CallForm.jsx
// Project:     Seasonal Entertainment
// Description: Creating a call (organisers and admins): title, optional description, an
//              optional planned start in the browser's local time (sent as UTC) and, optionally,
//              the event bot occurrence it belongs to (EventSelect.jsx). Without a planned start
//              the button reads "Start call now" (the Calls page then starts the call and joins
//              it, docs/CALLS.md, "Starting a call"); with one, "Create call". It switches as the
//              field changes.
// ============================================================

import { useState } from 'react';
import { FormField, FormMessage } from '../components/FormField.jsx';
import EventSelect from './EventSelect.jsx';

const EMPTY = { title: '', description: '', when: '', event: null };

// onCreate({ title, description, scheduledFor, botOccurrenceId }) resolves when saved (and, with
// no scheduledFor, started), throws on an error. events: the bot's upcoming occurrences for the
// picker.
export default function CallForm({ onCreate, events }) {
  const [call, setCall] = useState(EMPTY);
  const [error, setError] = useState(null);
  const set = (name) => (event) => setCall({ ...call, [name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      await onCreate({
        title: call.title,
        description: call.description,
        // datetime-local has no time zone: the browser's own, turned into UTC here.
        scheduledFor: call.when ? new Date(call.when).toISOString() : null,
        botOccurrenceId: call.event,
      });
      setCall(EMPTY);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="form card" aria-label="New call" onSubmit={submit}>
      <h2>New call</h2>
      <FormField label="Title" type="text" value={call.title} onChange={set('title')} required />
      <label className="form-field">
        <span className="form-field__label">Description (optional)</span>
        <textarea rows={3} value={call.description} onChange={set('description')} />
      </label>
      <FormField
        label="Planned start (optional)"
        type="datetime-local"
        value={call.when}
        onChange={set('when')}
      />
      <EventSelect
        label="Event of the event bot (optional)"
        value={call.event}
        onChange={(event) => setCall({ ...call, event })}
        occurrences={events}
      />
      <FormMessage error={error} />
      <button className="button" type="submit">
        {call.when ? 'Create call' : 'Start call now'}
      </button>
    </form>
  );
}
