// ============================================================
// File:        CallForm.jsx
// Path:        client/src/calls/CallForm.jsx
// Project:     Seasonal Entertainment
// Description: Creating a call (organisers and admins): title, optional description and an
//              optional planned start in the browser's local time (sent as UTC).
// ============================================================

import { useState } from 'react';
import { FormField, FormMessage } from '../components/FormField.jsx';

const EMPTY = { title: '', description: '', when: '' };

// onCreate({ title, description, scheduledFor }) resolves when saved, throws on an error.
export default function CallForm({ onCreate }) {
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
      <FormMessage error={error} />
      <button className="button" type="submit">
        Create call
      </button>
    </form>
  );
}
