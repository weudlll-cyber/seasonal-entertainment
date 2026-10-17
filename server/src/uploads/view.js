// ============================================================
// File:        view.js
// Path:        server/src/uploads/view.js
// Project:     Seasonal Entertainment
// Description: What the client sees of an uploaded chat file: its display name, size and the
//              URLs it is fetched from. Every URL goes through the access check in routes.js;
//              uploaded files are never served from the public /media folder.
// ============================================================

const base = (id) => `/api/chat/files/${id}`;

// Images: a thumbnail for the chat and the full (metadata-free) image behind a click.
// PDFs: only a download. A removed file is just { removed: true }.
export function fileView(upload) {
  if (!upload.file) return { removed: true };
  const view = { id: upload.id, kind: upload.kind, name: upload.name, bytes: upload.bytes };
  if (upload.kind === 'pdf') return { ...view, downloadUrl: `${base(upload.id)}/download` };
  return {
    ...view,
    width: upload.width,
    height: upload.height,
    thumbUrl: `${base(upload.id)}/thumb`,
    url: `${base(upload.id)}/full`,
  };
}
