// ============================================================
// File:        retention.js
// Path:        server/src/chat/retention.js
// Project:     Seasonal Entertainment
// Description: Chat retention: messages older than CHAT_RETENTION_DAYS (default 90) are
//              deleted (their reports with them), and guest names unused for 30 days (the
//              session lifetime) are released. Runs at start and then every six hours.
// ============================================================

import { deleteMediaFile } from '../media/files.js';
import { deleteUnusedPreviews } from '../previews/store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const GUEST_NAME_DAYS = 30;

// Returns how many messages were deleted.
export function deleteExpiredChat(db, retentionDays, now = Date.now()) {
  const messagesBefore = new Date(now - retentionDays * DAY_MS).toISOString();
  const guestsBefore = new Date(now - GUEST_NAME_DAYS * DAY_MS).toISOString();
  return db.transaction(() => {
    const { changes } = db
      .prepare('DELETE FROM chat_messages WHERE created_at < ?')
      .run(messagesBefore);
    db.prepare('DELETE FROM chat_guests WHERE last_seen < ?').run(guestsBefore);
    return changes;
  })();
}

// Link previews no message uses and older than the cache: rows and image files go.
export function deleteUnusedPreviewFiles(db, config, now = Date.now()) {
  const before = new Date(now - config.linkPreviews.cacheHours * 60 * 60 * 1000).toISOString();
  const files = deleteUnusedPreviews(db, before);
  for (const file of files) deleteMediaFile(config, file);
  return files.length;
}

export function startChatRetention(db, config, log = console.log) {
  const run = () => {
    deleteUnusedPreviewFiles(db, config);
    const deleted = deleteExpiredChat(db, config.chat.retentionDays);
    if (deleted)
      log(
        `[chat] retention: deleted ${deleted} messages older than ${config.chat.retentionDays} days`
      );
  };
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
