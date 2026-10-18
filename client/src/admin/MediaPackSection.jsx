// ============================================================
// File:        MediaPackSection.jsx
// Path:        client/src/admin/MediaPackSection.jsx
// Project:     Seasonal Entertainment
// Description: One pack on the admin "Chat media" page: rename, (de)activate, move up/down,
//              its items (MediaItemRow), and the upload form. The server checks the real file
//              type and the limits; the file picker only pre-filters.
// ============================================================

import { useState } from 'react';
import { api, upload } from '../api/http.js';
import MediaItemRow from './MediaItemRow.jsx';

const ACCEPT = { sticker: 'image/webp,image/png', gif: 'image/gif,image/webp' };

export default function MediaPackSection({ pack, isFirst, isLast, onMove, onRun }) {
  const [draft, setDraft] = useState({ name: pack.name, active: pack.active });
  const kindLabel = pack.kind === 'sticker' ? 'Stickers' : 'GIFs';

  function uploadItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fields = { name: data.get('name'), alt: data.get('alt') };
    if (data.get('credit')) fields.credit = data.get('credit');
    onRun(async () => {
      await upload(`/admin/chat/media/packs/${pack.id}/items`, form.elements.file.files[0], fields);
      form.reset();
    });
  }

  return (
    <section className="admin-media-pack" aria-label={`${kindLabel}: ${pack.name}`}>
      <h3>
        {kindLabel}: {pack.name} {!pack.active && <em>(inactive)</em>}
      </h3>
      <div className="admin-row-actions">
        <input
          aria-label={`Name of pack ${pack.name}`}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <label>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />{' '}
          Active
        </label>
        <button
          className="button"
          type="button"
          onClick={() =>
            onRun(() => api(`/admin/chat/media/packs/${pack.id}`, { method: 'PUT', body: draft }))
          }
        >
          Save pack
        </button>
        <button className="link-button" type="button" disabled={isFirst} onClick={() => onMove(-1)}>
          Move up
        </button>
        <button className="link-button" type="button" disabled={isLast} onClick={() => onMove(1)}>
          Move down
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Name</th>
              <th>Alt text</th>
              <th>Credit</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pack.items.map((item) => (
              <MediaItemRow
                key={`${item.id}-${item.name}-${item.active}`}
                item={item}
                onRun={onRun}
              />
            ))}
          </tbody>
        </table>
      </div>
      <form className="admin-row-actions" onSubmit={uploadItem}>
        <input
          type="file"
          name="file"
          accept={ACCEPT[pack.kind]}
          aria-label={`File for ${pack.name}`}
          required
        />
        <input
          name="name"
          aria-label={`New item name in ${pack.name}`}
          placeholder="Name"
          required
        />
        <input
          name="alt"
          aria-label={`New item alt text in ${pack.name}`}
          placeholder="Alt text"
          required
        />
        <input
          name="credit"
          aria-label={`New item credit in ${pack.name}`}
          placeholder="Credit (optional)"
        />
        <button className="button" type="submit">
          Upload
        </button>
      </form>
    </section>
  );
}
