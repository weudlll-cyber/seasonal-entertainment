// ============================================================
// File:        retention.js
// Path:        server/src/chat/retention.js
// Project:     Seasonal Entertainment
// Description: Chat retention: messages older than CHAT_RETENTION_DAYS (default 90) are
//              deleted (their reports with them), direct messages too (the same setting),
//              shared copies of reported private messages 90 days after the report was
//              reviewed (decided 2026-10-18), files uploaded with any message that no
//              longer exists go with it (rows and files on disk; room uploads and the
//              encrypted files of direct messages alike, with the report copies' shared
//              files and any direct file no row names, e.g. after an account's deletion),
//              uploads never sent are
//              deleted after an hour, unused link previews after the cache time, and guest
//              names unused for 30 days (the session lifetime) are released. Runs at start and
//              then every six hours.
// ============================================================

import {
  deleteOrphanDirectFiles,
  deleteReportFilesWithoutCopies,
  unreferencedFiles,
} from '../directFiles/store.js';
import { deleteMediaFile } from '../media/files.js';
import { deleteUnusedPreviews } from '../previews/store.js';
import { getSetting } from '../settings/store.js';
import { deleteOrphanUploads } from '../uploads/store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_NAME_DAYS = 30;
const REVIEWED_COPY_DAYS = 90;

// Returns how many messages (room and direct) were deleted.
export function deleteExpiredChat(db, retentionDays, now = Date.now()) {
  const messagesBefore = new Date(now - retentionDays * DAY_MS).toISOString();
  const guestsBefore = new Date(now - GUEST_NAME_DAYS * DAY_MS).toISOString();
  const copiesReviewedBefore = new Date(now - REVIEWED_COPY_DAYS * DAY_MS).toISOString();
  return db.transaction(() => {
    const { changes } = db
      .prepare('DELETE FROM chat_messages WHERE created_at < ?')
      .run(messagesBefore);
    const direct = db
      .prepare('DELETE FROM direct_messages WHERE created_at < ?')
      .run(messagesBefore).changes;
    db.prepare('DELETE FROM chat_guests WHERE last_seen < ?').run(guestsBefore);
    db.prepare(
      `DELETE FROM direct_report_copies WHERE report_id IN
         (SELECT id FROM direct_reports WHERE reviewed_at < ?)`
    ).run(copiesReviewedBefore);
    return changes + direct;
  })();
}

// Link previews no message uses and older than the cache: rows and image files go.
export function deleteUnusedPreviewFiles(db, config, now = Date.now()) {
  const before = new Date(now - config.linkPreviews.cacheHours * 60 * 60 * 1000).toISOString();
  const files = deleteUnusedPreviews(db, before);
  for (const file of files) deleteMediaFile(config, file);
  return files.length;
}

// Uploads whose message is gone (deleted here or in any other way) and uploads never sent:
// rows and files go, so no file outlives its message.
function deleteOrphanUploadFiles(db, config, now = Date.now()) {
  const pendingBefore = new Date(now - config.uploads.pendingMinutes * 60_000).toISOString();
  const files = deleteOrphanUploads(db, pendingBefore);
  for (const file of files) deleteMediaFile(config, file);
  return files.length;
}

// Files of direct messages whose message is gone (or never sent), shared report files whose
// copy is gone, and whatever is left on disk without a row: deleted from disk.
function deleteOrphanDirectFileData(db, config, now = Date.now()) {
  const pendingBefore = new Date(now - config.uploads.pendingMinutes * 60_000).toISOString();
  deleteOrphanDirectFiles(db, pendingBefore);
  deleteReportFilesWithoutCopies(db);
  const files = unreferencedFiles(db, config.mediaDir);
  for (const file of files) deleteMediaFile(config, file);
  return files.length;
}

// One full run; returns what it deleted.
export function runChatRetention(db, config, now = Date.now()) {
  // How long messages are kept is a site setting (its default: CHAT_RETENTION_DAYS).
  const messages = deleteExpiredChat(db, getSetting(db, 'chat.retentionDays'), now);
  const uploadFiles =
    deleteOrphanUploadFiles(db, config, now) + deleteOrphanDirectFileData(db, config, now);
  const previewFiles = deleteUnusedPreviewFiles(db, config, now);
  return { messages, uploadFiles, previewFiles };
}

export function startChatRetention(db, config, log = console.log) {
  const run = () => {
    const { messages, uploadFiles } = runChatRetention(db, config);
    if (messages || uploadFiles) {
      log(
        `[chat] retention: deleted ${messages} messages older than ${getSetting(db, 'chat.retentionDays')} days and ${uploadFiles} uploaded files`
      );
    }
  };
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
