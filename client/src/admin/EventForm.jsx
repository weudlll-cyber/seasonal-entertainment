// ============================================================
// File:        EventForm.jsx
// Path:        client/src/admin/EventForm.jsx
// Project:     Seasonal Entertainment
// Description: Form for one event (create or edit): title, description, repetition, weekday,
//              time in UTC, optional duration, channel, optional https link, active.
// ============================================================

import { useState } from 'react';
import { WEEKDAYS } from '@seasonal-entertainment/shared/eventSchedule.js';
import { FormField, FormMessage } from '../components/FormField.jsx';

export const NEW_EVENT = {
  title: '',
  description: '',
  rule: 'weekly',
  weekday: 1,
  timeUtc: '18:00',
  durationMinutes: null,
  channel: '',
  link: '',
  active: true,
};

export default function EventForm({ initial, onSave, onCancel, error }) {
  const [event, setEvent] = useState(initial);
  const set = (name, value) => setEvent({ ...event, [name]: value });

  function submit(e) {
    e.preventDefault();
    onSave(event);
  }

  return (
    <form className="form" onSubmit={submit} aria-label="Event">
      <FormField
        label="Title"
        type="text"
        value={event.title}
        onChange={(e) => set('title', e.target.value)}
        required
      />
      <label className="form-field">
        <span className="form-field__label">Description</span>
        <textarea
          rows={3}
          value={event.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>
      <label className="form-field">
        <span className="form-field__label">Repeats</span>
        <select value={event.rule} onChange={(e) => set('rule', e.target.value)}>
          <option value="weekly">Every week</option>
          <option value="monthly_first">First of the month (that weekday)</option>
        </select>
      </label>
      <label className="form-field">
        <span className="form-field__label">Weekday</span>
        <select value={event.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
          {WEEKDAYS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <FormField
        label="Time (UTC)"
        type="time"
        value={event.timeUtc}
        onChange={(e) => set('timeUtc', e.target.value)}
        required
      />
      <FormField
        label="Duration in minutes (optional)"
        type="number"
        min="1"
        max="1440"
        value={event.durationMinutes ?? ''}
        onChange={(e) => set('durationMinutes', e.target.value ? Number(e.target.value) : null)}
      />
      <FormField
        label="Channel"
        type="text"
        value={event.channel}
        onChange={(e) => set('channel', e.target.value)}
        hint='For example "Discord: Seasonal Tokens server" or "Telegram".'
      />
      <FormField
        label="Link (optional, https://)"
        type="url"
        value={event.link}
        onChange={(e) => set('link', e.target.value)}
      />
      <label className="form-check">
        <input
          type="checkbox"
          checked={event.active}
          onChange={(e) => set('active', e.target.checked)}
        />
        <span>Active (shown on the events page)</span>
      </label>
      <FormMessage error={error} />
      <div className="admin-row-actions">
        <button className="button" type="submit">
          Save event
        </button>
        <button className="link-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
