// ============================================================
// File:        accountData.js
// Path:        server/src/chat/accountData.js
// Project:     Seasonal Entertainment
// Description: The chat's part of deleting an account (accounts/deletion.js, docs/AUTH.md
//              "Deleting an account"), offered through the mountChat() handle (chat.accounts):
//              the rows the chat schemas keep when an account goes (ON DELETE SET NULL) or name
//              only as text — room messages and uploads, room reports, the partners' read marks
//              of the account's conversations — and the media files of everything the account's
//              deletion removes, room uploads, direct files and shared report files alike. Pages
//              already open hear which of the account's room messages went ("deleted",
//              messagesDeleted()), so they drop them without a reload, and the room's readers
//              recount their unread messages ("activity", as after a hidden message).
// ============================================================

import { deleteMediaFile } from '../media/files.js';
import { findRoom } from './store.js';

// Every file on disk that belongs to the account's chat rows, as media paths: its room uploads,
// the direct files of its conversations (both partners'), and the files shared with reports
// made by or about it.
function filesOf(db, userId) {
  const uploads = db
    .prepare('SELECT file, thumb_file AS thumbFile FROM chat_uploads WHERE user_id = ?')
    .all(userId)
    .flatMap((row) => [row.file, row.thumbFile]);
  const direct = db
    .prepare('SELECT file FROM direct_files WHERE uploader_id = ? OR partner_id = ?')
    .all(userId, userId)
    .map((row) => row.file);
  const reported = db
    .prepare(
      `SELECT f.file FROM direct_report_files f JOIN direct_reports r ON r.id = f.report_id
       WHERE r.reporter_id = ? OR r.partner_id = ?`
    )
    .all(userId, userId)
    .map((row) => row.file);
  return [...uploads, ...direct, ...reported].filter(Boolean);
}

// Runs inside the caller's transaction, before the account row goes (its cascade removes the
// direct rows these files belong to). Returns what to do once that commits: { files, messages }
// (the files to delete; the room messages removed, as { roomId, id }).
export function deleteChatData(db, userId) {
  const files = filesOf(db, userId);
  const messages = db
    .prepare('SELECT room_id AS roomId, id FROM chat_messages WHERE author_user_id = ?')
    .all(userId);
  // chat_uploads and chat_messages keep their rows with SET NULL; here they go. Reports of
  // the deleted messages and mentions in them follow by cascade.
  db.prepare('DELETE FROM chat_uploads WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM chat_messages WHERE author_user_id = ?').run(userId);
  // A room report names its reporter as text ("user:<id>", routes.js), not as a key.
  db.prepare('DELETE FROM chat_reports WHERE reporter = ?').run(`user:${userId}`);
  // The partners' read marks of their conversations with this account (target_id is the
  // partner's id, not a foreign key).
  db.prepare("DELETE FROM chat_reads WHERE scope = 'direct' AND target_id = ?").run(userId);
  return { files, messages };
}

// One "deleted" event per room through the hub's usual push (hub.broadcast: only to sockets
// that may read the room), naming the room messages that went (deleteChatData's messages).
// Then, as for a hidden message (moderationRoutes.js), "activity" to every member who may read
// the room, also on pages that do not show it: their unread counts (unread.js) are read again
// and stop counting the messages that went.
export function messagesDeleted(hub, db, messages) {
  const byRoom = Map.groupBy(messages, (m) => m.roomId);
  for (const [roomId, rows] of byRoom) {
    hub.broadcast(roomId, { type: 'deleted', ids: rows.map((m) => m.id) });
    const room = findRoom(db, roomId);
    hub.notifyReaders(room, { type: 'activity', room: room?.slug });
  }
}

export function deleteChatFiles(config, files) {
  for (const file of files) deleteMediaFile(config, file);
}
