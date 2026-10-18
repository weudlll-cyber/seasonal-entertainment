// ============================================================
// File:        store.js
// Path:        server/src/uploads/store.js
// Project:     Seasonal Entertainment
// Description: Data access for chat file uploads: create a pending upload, a member's bytes in
//              the last 24 hours (daily quota), attach an upload to a message (only the
//              uploader's own, once), remove a file (moderation), and the rows to clean up:
//              files whose message is gone, and uploads never sent.
// ============================================================

const now = () => new Date().toISOString();
const COLUMNS = `id, user_id AS userId, message_id AS messageId, attached_at AS attachedAt, kind,
  name, mime, bytes, file, thumb_file AS thumbFile, width, height, created_at AS createdAt,
  removed_at AS removedAt`;

export function findUpload(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM chat_uploads WHERE id = ?`).get(id);
}

export function findUploadForMessage(db, messageId) {
  return db.prepare(`SELECT ${COLUMNS} FROM chat_uploads WHERE message_id = ?`).get(messageId);
}

// stored: { kind, name, mime, bytes, file, thumbFile, width, height }.
export function createUpload(db, userId, stored) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO chat_uploads
         (user_id, kind, name, mime, bytes, file, thumb_file, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      stored.kind,
      stored.name,
      stored.mime,
      stored.bytes,
      stored.file,
      stored.thumbFile ?? null,
      stored.width ?? null,
      stored.height ?? null,
      now()
    );
  return findUpload(db, Number(lastInsertRowid));
}

export function bytesUploadedSince(db, userId, sinceIso) {
  return db
    .prepare(
      'SELECT COALESCE(SUM(bytes), 0) AS n FROM chat_uploads WHERE user_id = ? AND created_at > ?'
    )
    .get(userId, sinceIso).n;
}

// Can this member attach this upload: theirs, not yet sent, not removed?
export function isAttachable(db, uploadId, userId) {
  const upload = findUpload(db, uploadId);
  return Boolean(upload && upload.userId === userId && !upload.attachedAt && upload.file);
}

// true when attached (the same conditions, checked again in the write itself).
export function attachUpload(db, uploadId, userId, messageId) {
  return (
    db
      .prepare(
        `UPDATE chat_uploads SET message_id = ?, attached_at = ?
         WHERE id = ? AND user_id = ? AND attached_at IS NULL AND file IS NOT NULL`
      )
      .run(messageId, now(), uploadId, userId).changes === 1
  );
}

// Moderation: the row stays (for "file removed"); returns the files to delete from disk.
export function removeUploadFiles(db, uploadId, moderator) {
  const upload = findUpload(db, uploadId);
  db.prepare(
    `UPDATE chat_uploads SET file = NULL, thumb_file = NULL, removed_at = ?, removed_by = ?
     WHERE id = ?`
  ).run(now(), moderator, uploadId);
  return [upload.file, upload.thumbFile].filter(Boolean);
}

// Uploads whose message no longer exists (retention or any other deletion), and uploads
// never sent within `pendingBeforeIso`: rows deleted; returns their files.
export function deleteOrphanUploads(db, pendingBeforeIso) {
  const orphans = `FROM chat_uploads WHERE message_id IS NULL
    AND (attached_at IS NOT NULL OR created_at < ?)`;
  return db.transaction(() => {
    const files = db
      .prepare(`SELECT file, thumb_file AS thumbFile ${orphans}`)
      .all(pendingBeforeIso)
      .flatMap((row) => [row.file, row.thumbFile])
      .filter(Boolean);
    db.prepare(`DELETE ${orphans}`).run(pendingBeforeIso);
    return files;
  })();
}
