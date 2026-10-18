// ============================================================
// File:        AdminEventsPage.jsx
// Path:        client/src/admin/AdminEventsPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin events list: add, edit, deactivate/activate and delete events (delete
//              asks once more). Times are entered and listed in UTC.
// ============================================================

import { useEffect, useState } from 'react';
import { WEEKDAYS } from '@seasonal-entertainment/shared/eventSchedule.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';
import EventForm, { NEW_EVENT } from './EventForm.jsx';

// The fields the server takes; the list rows also carry `id`.
const payload = ({ id: _id, ...fields }) => fields;

export default function AdminEventsPage() {
  const [events, setEvents] = useState([]);
  const [editing, setEditing] = useState(null); // 'new', an event id, or null
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('/admin/events')
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err.message));
  }, [version]);

  async function run(call) {
    setError(null);
    try {
      await call();
      setEditing(null);
      setConfirmDelete(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  const save = (event) =>
    run(() =>
      editing === 'new'
        ? api('/admin/events', { method: 'POST', body: payload(event) })
        : api(`/admin/events/${editing}`, { method: 'PUT', body: payload(event) })
    );

  return (
    <>
      <h2>Events</h2>
      <p>Times are in UTC. Visitors see them in their own time zone.</p>
      {editing === null && (
        <p>
          <button className="button" type="button" onClick={() => setEditing('new')}>
            Add event
          </button>
        </p>
      )}
      {editing !== null && (
        <EventForm
          key={editing}
          initial={editing === 'new' ? NEW_EVENT : events.find((e) => e.id === editing)}
          onSave={save}
          onCancel={() => setEditing(null)}
          error={error}
        />
      )}
      {editing === null && <FormMessage error={error} />}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Event</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  {event.rule === 'monthly_first' ? 'First ' : ''}
                  {WEEKDAYS[event.weekday - 1]} {event.timeUtc}
                </td>
                <td>
                  <strong>{event.title}</strong>
                  {event.channel && <br />}
                  {event.channel}
                </td>
                <td>{event.active ? 'active' : 'inactive'}</td>
                <td className="admin-row-actions">
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => setEditing(event.id)}
                  >
                    Edit
                  </button>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() =>
                      run(() =>
                        api(`/admin/events/${event.id}`, {
                          method: 'PUT',
                          body: payload({ ...event, active: !event.active }),
                        })
                      )
                    }
                  >
                    {event.active ? 'Deactivate' : 'Activate'}
                  </button>
                  {confirmDelete === event.id ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() =>
                        run(() => api(`/admin/events/${event.id}`, { method: 'DELETE' }))
                      }
                    >
                      Really delete {event.title}?
                    </button>
                  ) : (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setConfirmDelete(event.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
