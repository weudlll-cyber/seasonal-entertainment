// ============================================================
// File:        MediaPackSection.jsx
// Path:        client/src/admin/MediaPackSection.jsx
// Project:     Seasonal Entertainment
// Description: One pack on the admin "Chat media" page: rename, (de)activate, move up/down,
//              its items (MediaItemRow), and the upload form of one or many files
//              (MediaUploadForm). The server checks the real file type and the limits; the file
//              picker only pre-filters.
// ============================================================

import { useState } from 'react';
import { api } from '../api/http.js';
import MediaItemRow from './MediaItemRow.jsx';
import MediaUploadForm from './MediaUploadForm.jsx';

// refused, onUploaded: the last upload's refused files, kept by the page (MediaUploadForm).
export default function MediaPackSection({
  pack,
  isFirst,
  isLast,
  onMove,
  onRun,
  refused,
  onUploaded,
}) {
  const [draft, setDraft] = useState({ name: pack.name, active: pack.active });
  const kindLabel = pack.kind === 'sticker' ? 'Stickers' : 'GIFs';

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
      <MediaUploadForm pack={pack} refused={refused} onUploaded={onUploaded} />
    </section>
  );
}
