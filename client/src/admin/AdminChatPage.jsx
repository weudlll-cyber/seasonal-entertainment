// ============================================================
// File:        AdminChatPage.jsx
// Path:        client/src/admin/AdminChatPage.jsx
// Project:     Seasonal Entertainment
// Description: Admin chat page: rooms (add, edit who may read and write, and whether guests
//              may write: only where explicitly ticked; off for new rooms), reported messages
//              (hide them, or keep them: marked reviewed, their preview shows again), and
//              active mutes and bans (lift them).
// ============================================================

import { useEffect, useState } from 'react';
import { ROOM_ACCESS } from '@seasonal-entertainment/shared/chatRules.js';
import { api } from '../api/http.js';
import { FormMessage } from '../components/FormField.jsx';

const NEW_ROOM = {
  slug: '',
  name: '',
  readAccess: 'members',
  writeAccess: 'members',
  guestWritable: false,
};

function AccessSelect({ label, value, onChange }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {ROOM_ACCESS.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}

function RoomRow({ room, onSave }) {
  const [draft, setDraft] = useState(room);
  const set = (name) => (value) => setDraft({ ...draft, [name]: value });
  const label = room.id ? room.name : 'new room';
  return (
    <tr>
      <td>
        <input
          aria-label={`Name of ${label}`}
          value={draft.name}
          onChange={(e) => set('name')(e.target.value)}
        />
      </td>
      <td>
        <input
          aria-label={`Slug of ${label}`}
          value={draft.slug}
          onChange={(e) => set('slug')(e.target.value)}
        />
      </td>
      <td>
        <AccessSelect
          label={`Who reads ${label}`}
          value={draft.readAccess}
          onChange={set('readAccess')}
        />
      </td>
      <td>
        <AccessSelect
          label={`Who writes ${label}`}
          value={draft.writeAccess}
          onChange={set('writeAccess')}
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`Guests write in ${label}`}
          checked={draft.guestWritable}
          onChange={(e) => set('guestWritable')(e.target.checked)}
        />
      </td>
      <td>
        <button className="button" type="button" onClick={() => onSave(draft)}>
          {room.id ? 'Save' : 'Add room'}
        </button>
      </td>
    </tr>
  );
}

export default function AdminChatPage() {
  const [data, setData] = useState({ rooms: [], reports: [], sanctions: [] });
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    Promise.all([api('/admin/chat/rooms'), api('/chat/reports'), api('/chat/sanctions')])
      .then(([rooms, reports, sanctions]) =>
        setData({ rooms: rooms.rooms, reports: reports.messages, sanctions: sanctions.sanctions })
      )
      .catch((err) => setError(err.message));
  }, [version]);

  async function run(call) {
    setError(null);
    try {
      await call();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  const saveRoom = ({ id, slug, name, readAccess, writeAccess, guestWritable }) =>
    run(() =>
      api(id ? `/admin/chat/rooms/${id}` : '/admin/chat/rooms', {
        method: id ? 'PUT' : 'POST',
        body: { slug, name, readAccess, writeAccess, guestWritable },
      })
    );

  return (
    <>
      <h2>Chat</h2>
      <FormMessage error={error} />
      <h3>Rooms</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Who reads</th>
              <th>Who writes</th>
              <th>Guests write</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((room) => (
              <RoomRow key={`${room.id}-${version}`} room={room} onSave={saveRoom} />
            ))}
            <RoomRow key={`new-${version}`} room={NEW_ROOM} onSave={saveRoom} />
          </tbody>
        </table>
      </div>
      <h3>Reported messages</h3>
      {data.reports.length === 0 && <p>No open reports.</p>}
      <ul className="link-list">
        {data.reports.map((m) => (
          <li key={m.id}>
            <strong>{m.author}</strong> in {m.room} ({m.reports} reports): {m.body}{' '}
            <button
              className="link-button"
              type="button"
              onClick={() => run(() => api(`/chat/messages/${m.id}/hide`, { method: 'POST' }))}
            >
              Hide
            </button>{' '}
            <button
              className="link-button"
              type="button"
              onClick={() => run(() => api(`/chat/messages/${m.id}/reviewed`, { method: 'POST' }))}
            >
              Keep (reviewed)
            </button>
          </li>
        ))}
      </ul>
      <h3>Mutes and bans</h3>
      {data.sanctions.length === 0 && <p>None active.</p>}
      <ul className="link-list">
        {data.sanctions.map((s) => (
          <li key={s.id}>
            {s.kind} of <strong>{s.target}</strong>{' '}
            {s.until ? `until ${s.until.slice(0, 16).replace('T', ' ')} UTC` : '(no end)'} by{' '}
            {s.createdBy}{' '}
            <button
              className="link-button"
              type="button"
              onClick={() => run(() => api(`/chat/sanctions/${s.id}/lift`, { method: 'POST' }))}
            >
              Lift
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
