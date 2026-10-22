// ============================================================
// File:        store.js
// Path:        server/src/directFiles/store.js
// Project:     Seasonal Entertainment
// Description: Data access for files in direct messages (schema.js): store a pending upload,
//              the bytes a member uploaded in 24 hours (counted with the room uploads, one
//              daily quota), attach a file to the message that carries it (the uploader's own,
//              to that partner, once), who may fetch it, a reporter's shared copy, and the
//              clean-up: rows whose message is gone, uploads never sent, and files on disk that
//              no row names any more (an account's deletion removes its rows by cascade).
// ============================================================

import { readdirSync } from 'node:fs';
import path from 'node:path';

const now = () => new Date().toISOString();
export const DIRECT_FOLDER = 'direct';
export const REPORT_FOLDER = 'direct-reports';

export function createDirectFile(db, { uploaderId, partnerId, file, bytes }) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO direct_files (uploader_id, partner_id, file, bytes, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(uploaderId, partnerId, file, bytes, now());
  return Number(lastInsertRowid);
}

export function findDirectFile(db, id) {
  return db
    .prepare(
      `SELECT id, uploader_id AS uploaderId, partner_id AS partnerId, message_id AS messageId,
              attached_at AS attachedAt, file, bytes
       FROM direct_files WHERE id = ?`
    )
    .get(id);
}

export function directBytesSince(db, userId, sinceIso) {
  return db
    .prepare(
      'SELECT COALESCE(SUM(bytes), 0) AS n FROM direct_files WHERE uploader_id = ? AND created_at > ?'
    )
    .get(userId, sinceIso).n;
}

// true when attached: the sender's own pending upload for this partner.
export function attachDirectFile(db, fileId, { senderId, recipientId, messageId }) {
  return (
    db
      .prepare(
        `UPDATE direct_files SET message_id = ?, attached_at = ?
         WHERE id = ? AND uploader_id = ? AND partner_id = ? AND attached_at IS NULL`
      )
      .run(messageId, now(), fileId, senderId, recipientId).changes === 1
  );
}

// The two members of the conversation only; a file not yet sent, its uploader only.
export function mayFetchDirectFile(file, userId) {
  if (!file) return false;
  if (!file.attachedAt) return file.uploaderId === userId;
  return file.messageId !== null && (file.uploaderId === userId || file.partnerId === userId);
}

// The attached file of a direct message, if it has one.
export function fileOfMessage(db, messageId) {
  return db.prepare('SELECT id FROM direct_files WHERE message_id = ?').get(messageId);
}

// Is messageId one of the copies this reporter shared with this report about this partner?
export function isSharedCopy(db, { reportId, reporterId, partnerId, messageId }) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM direct_reports r JOIN direct_report_copies c ON c.report_id = r.id
         WHERE r.id = ? AND r.reporter_id = ? AND r.partner_id = ? AND c.message_id = ?`
      )
      .get(reportId, reporterId, partnerId, messageId)
  );
}

export function createReportFile(db, { reportId, messageId, name, file, bytes }) {
  db.prepare(
    `INSERT INTO direct_report_files (report_id, message_id, name, file, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(reportId, messageId, name, file, bytes, now());
}

export function findReportFile(db, reportId, messageId) {
  return db
    .prepare(
      `SELECT id, name, file, bytes FROM direct_report_files
       WHERE report_id = ? AND message_id = ?`
    )
    .get(reportId, messageId);
}

// Rows of files whose message is gone, and uploads never sent before `pendingBeforeIso`.
export function deleteOrphanDirectFiles(db, pendingBeforeIso) {
  db.prepare(
    `DELETE FROM direct_files WHERE message_id IS NULL
       AND (attached_at IS NOT NULL OR created_at < ?)`
  ).run(pendingBeforeIso);
}

// Shared files of reports whose copies were deleted (90 days after the review, retention.js).
export function deleteReportFilesWithoutCopies(db) {
  db.prepare(
    `DELETE FROM direct_report_files WHERE NOT EXISTS (
       SELECT 1 FROM direct_report_copies c
       WHERE c.report_id = direct_report_files.report_id
         AND c.message_id = direct_report_files.message_id)`
  ).run();
}

// The files on disk in the two folders that no row names: returned as media paths.
export function unreferencedFiles(db, mediaDir) {
  const named = new Set(
    db
      .prepare('SELECT file FROM direct_files UNION ALL SELECT file FROM direct_report_files')
      .all()
      .map((r) => r.file)
  );
  return [DIRECT_FOLDER, REPORT_FOLDER].flatMap((folder) => {
    let names;
    try {
      names = readdirSync(path.join(mediaDir, folder));
    } catch {
      return []; // no such folder yet
    }
    return names.map((name) => `${folder}/${name}`).filter((file) => !named.has(file));
  });
}
