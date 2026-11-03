// ============================================================
// File:        MediaUploadForm.jsx
// Path:        client/src/admin/MediaUploadForm.jsx
// Project:     Seasonal Entertainment
// Description: The upload form of one pack on the admin "Chat media" page (MediaPackSection):
//              one or many files at once, each sent on its own through the same per-file route
//              (POST /api/admin/chat/media/packs/:id/items, which checks the real type and the
//              limits), one after another, with the progress ("3 of 12"). Each item is named
//              after its file (without the extension; renamed afterwards in its row); the alt
//              text and credit typed here go with every file, the alt text defaulting to the
//              name. A refused file does not stop the others; the page keeps the list of
//              refused ones and why (AdminChatMediaPage), shown here.
// ============================================================

import { useState } from 'react';
import { upload } from '../api/http.js';

const ACCEPT = { sticker: 'image/webp,image/png', gif: 'image/gif,image/webp' };
const NAME_MAX = 60; // the server's limit for an item name (server/src/media/adminRoutes.js)

// "wave.final.gif" -> "wave.final"; a name without the dot part keeps it whole.
export const nameFromFile = (fileName) =>
  (fileName.replace(/\.[^.]*$/, '') || fileName).trim().slice(0, NAME_MAX);

// refused: [{ file, reason }] of the last upload; onUploaded(refused) when all are done.
export default function MediaUploadForm({ pack, refused = [], onUploaded }) {
  const [progress, setProgress] = useState(null); // { current, total } while sending

  async function uploadFiles(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = [...form.elements.file.files];
    const failed = [];
    for (const [index, file] of files.entries()) {
      setProgress({ current: index + 1, total: files.length });
      const name = nameFromFile(file.name);
      const fields = { name, alt: data.get('alt') || name };
      if (data.get('credit')) fields.credit = data.get('credit');
      try {
        await upload(`/admin/chat/media/packs/${pack.id}/items`, file, fields);
      } catch (err) {
        failed.push({ file: file.name, reason: err.message });
      }
    }
    setProgress(null);
    form.reset();
    onUploaded(failed);
  }

  return (
    <>
      <form className="admin-row-actions" onSubmit={uploadFiles}>
        <input
          type="file"
          name="file"
          multiple
          accept={ACCEPT[pack.kind]}
          aria-label={`Files for ${pack.name}`}
          required
        />
        <input
          name="alt"
          aria-label={`Alt text of the new items in ${pack.name}`}
          placeholder="Alt text (default: the name)"
        />
        <input
          name="credit"
          aria-label={`Credit of the new items in ${pack.name}`}
          placeholder="Credit (optional)"
        />
        <button className="button" type="submit" disabled={Boolean(progress)}>
          Upload
        </button>
      </form>
      {progress && (
        <p role="status">
          Uploading {progress.current} of {progress.total}…
        </p>
      )}
      {refused.length > 0 && (
        <div className="form-message form-message--error" role="alert">
          Not uploaded:
          <ul>
            {refused.map(({ file, reason }, index) => (
              // Two files may share a name.
              <li key={`${index}-${file}`}>
                {file}: {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
