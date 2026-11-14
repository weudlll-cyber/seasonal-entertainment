// ============================================================
// File:        recordingPreview.js
// Path:        server/src/calls/recordingPreview.js
// Project:     Seasonal Entertainment
// Description: A recording's preview image (docs/CALLS.md, "A recording's preview image";
//              decided 2026-11-14): the picture organisers and admins chose for it, a frame of
//              the video or an uploaded image, stored by the chat images' rules in the media
//              folder (chat.images.storePicture: a full image and a thumbnail), so it is in the
//              nightly backups like other media. Without one the share card keeps the site's
//              logo. Setting one replaces the old, whose files the caller deletes; removing it,
//              deleting the recording and deleting the call give their files back for that too.
// ============================================================

const now = () => new Date().toISOString();

// The stored files of one recording row ({ previewFile, previewThumb }), none when unset.
export const previewFiles = (row) => [row.previewFile, row.previewThumb].filter(Boolean);

// A finished recording's chosen image ({ previewFile, previewThumb, previewMime }), or null when
// there is no such recording or it has none (the public image route).
export function findPreview(db, id) {
  const row = db
    .prepare(
      `SELECT preview_file AS previewFile, preview_thumb AS previewThumb,
              preview_mime AS previewMime
       FROM call_recordings WHERE id = ? AND stopped_at IS NOT NULL`
    )
    .get(id);
  return row?.previewFile ? row : null;
}

const filesOf = (db, id) =>
  previewFiles(
    db
      .prepare(
        `SELECT preview_file AS previewFile, preview_thumb AS previewThumb
         FROM call_recordings WHERE id = ?`
      )
      .get(id) ?? {}
  );

// The addresses the pages use, or null without a chosen image. The time it was chosen is in
// the address: a new image is a new address, so a page or a card never shows the old one.
export function previewView(row) {
  if (!row.previewFile) return null;
  const base = `/api/calls/recordings/${row.id}/preview`;
  const version = encodeURIComponent(row.previewAt);
  return { full: `${base}/full?v=${version}`, thumb: `${base}/thumb?v=${version}` };
}

// stored: storePicture's row ({ file, thumbFile, mime }). Returns the replaced image's files.
export function setRecordingPreview(db, id, stored) {
  return db.transaction(() => {
    const replaced = filesOf(db, id);
    db.prepare(
      `UPDATE call_recordings SET preview_file = ?, preview_thumb = ?, preview_mime = ?,
              preview_at = ? WHERE id = ?`
    ).run(stored.file, stored.thumbFile, stored.mime, now(), id);
    return replaced;
  })();
}

// Back to the logo. Returns the removed image's files ([] when there was none).
export function removeRecordingPreview(db, id) {
  return db.transaction(() => {
    const removed = filesOf(db, id);
    db.prepare(
      `UPDATE call_recordings SET preview_file = NULL, preview_thumb = NULL, preview_mime = NULL,
              preview_at = NULL WHERE id = ?`
    ).run(id);
    return removed;
  })();
}

// Every preview file of a call's recordings, for the call's deletion (deleteCall.js).
export function callPreviewFiles(db, callId) {
  return db
    .prepare(
      `SELECT preview_file AS previewFile, preview_thumb AS previewThumb FROM call_recordings
       WHERE call_id = ?`
    )
    .all(callId)
    .flatMap(previewFiles);
}
