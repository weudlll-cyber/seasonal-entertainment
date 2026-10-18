// ============================================================
// File:        MediaItemRow.jsx
// Path:        client/src/admin/MediaItemRow.jsx
// Project:     Seasonal Entertainment
// Description: One sticker or GIF on the admin "Chat media" page: thumbnail, name, alt text,
//              credit, active; Save and Delete (after a confirmation; old messages then show
//              "media removed").
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';

export default function MediaItemRow({ item, onRun }) {
  const [draft, setDraft] = useState(item);
  const set = (name) => (value) => setDraft({ ...draft, [name]: value });
  const text = (name, label) => (
    <td>
      <input
        aria-label={`${label} of ${item.name}`}
        value={draft[name] ?? ''}
        onChange={(e) => set(name)(e.target.value)}
      />
    </td>
  );

  const save = () =>
    onRun(() =>
      api(`/admin/chat/media/items/${item.id}`, {
        method: 'PUT',
        body: {
          name: draft.name,
          alt: draft.alt,
          credit: draft.credit || null,
          active: draft.active,
        },
      })
    );
  const remove = () => {
    if (!window.confirm(`Delete "${item.name}"? Messages with it will show "media removed".`))
      return;
    onRun(() => api(`/admin/chat/media/items/${item.id}`, { method: 'DELETE' }));
  };

  return (
    <tr>
      <td>
        <img className="admin-media-thumb" src={item.url} alt={item.alt} />
      </td>
      {text('name', 'Name')}
      {text('alt', 'Alt text')}
      {text('credit', 'Credit')}
      <td>
        <input
          type="checkbox"
          aria-label={`${item.name} active`}
          checked={draft.active}
          onChange={(e) => set('active')(e.target.checked)}
        />
      </td>
      <td className="admin-row-actions">
        <button className="button" type="button" onClick={save}>
          Save
        </button>
        <button className="link-button" type="button" onClick={remove}>
          Delete
        </button>
      </td>
    </tr>
  );
}
