// ============================================================
// File:        EventSelect.jsx
// Path:        client/src/calls/EventSelect.jsx
// Project:     Seasonal Entertainment
// Description: The organisers' picker of an event bot occurrence for a call (docs/CALLS.md,
//              "Linked to a bot event"): "No event" or one of the next 30 days' occurrences
//              (GET /api/calls/bot-occurrences), each with its date in the site's format.
//              Used by the new-call form and by a planned call's card.
// ============================================================

import { formatWhen } from '../app/dates.js';

// value: the picked occurrence id or null; onChange(id | null); occurrences: [{ id, name, start }].
export default function EventSelect({ label, value, onChange, occurrences }) {
  return (
    <label className="form-field">
      <span className="form-field__label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">No event</option>
        {occurrences.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} — {formatWhen(o.start)}
          </option>
        ))}
      </select>
    </label>
  );
}
