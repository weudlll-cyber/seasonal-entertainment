// ============================================================
// File:        roomDeletion.js
// Path:        server/src/chat/roomDeletion.js
// Project:     Seasonal Entertainment
// Description: Deleting a whole chat room, for an area whose room it is (a call's chat, deleted
//              with its call: calls/deleteCall.js, docs/CALLS.md "Deleting a call"), offered
//              through the mountChat() handle (chat.rooms.remove / afterRemove). In the caller's
//              transaction: the uploads of the room's messages (their rows; ON DELETE SET NULL
//              would keep them), the read markers of the room (chat_reads names it by id only),
//              and the room itself, whose messages, reports, mentions, favourites, mutes and
//              step rules follow by cascade. After the commit: the uploads' files on disk, and
//              every socket still on the room told it is gone ("not_allowed" with its slug, as
//              when a reader loses a room).
// ============================================================

import { deleteChatFiles } from './accountData.js';

// In the caller's transaction. Returns what afterRoomDeleted needs: { roomId, slug, files }, or
// null when there is no such room.
export function deleteRoomData(db, roomId) {
  const room = db.prepare('SELECT slug FROM chat_rooms WHERE id = ?').get(roomId);
  if (!room) return null;
  const files = db
    .prepare(
      `SELECT u.file, u.thumb_file AS thumbFile FROM chat_uploads u
       JOIN chat_messages m ON m.id = u.message_id WHERE m.room_id = ?`
    )
    .all(roomId)
    .flatMap((row) => [row.file, row.thumbFile])
    .filter(Boolean);
  db.prepare(
    'DELETE FROM chat_uploads WHERE message_id IN (SELECT id FROM chat_messages WHERE room_id = ?)'
  ).run(roomId);
  db.prepare("DELETE FROM chat_reads WHERE scope = 'room' AND target_id = ?").run(roomId);
  db.prepare('DELETE FROM chat_rooms WHERE id = ?').run(roomId);
  return { roomId, slug: room.slug, files };
}

// After the commit (removed: deleteRoomData's answer, or null).
export function afterRoomDeleted(config, hub, removed) {
  if (!removed) return;
  deleteChatFiles(config, removed.files);
  hub.roomGone(removed.roomId, removed.slug);
}
