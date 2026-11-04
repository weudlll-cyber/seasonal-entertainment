// ============================================================
// File:        deleteCall.js
// Path:        server/src/calls/deleteCall.js
// Project:     Seasonal Entertainment
// Description: Deleting a call completely (docs/CALLS.md, "Deleting a call"; decided 2026-11-04:
//              a technical test call leaves nothing visible). Admins only, an ended call only
//              (routes.js). One transaction removes the call row (with it, by cascade: its
//              participants, reminders, recordings and their chapter marks; its link to an event
//              bot occurrence is a column of the row, the bot's own data is never touched) and its
//              chat room with everything in it (chat/roomDeletion.js), and writes the audit entry
//              (who, when, the call's id and title), which stays. After the commit the recordings'
//              files and the chat's uploaded files go, and pages still on its chat hear so.
// ============================================================

import { rmSync } from 'node:fs';
import path from 'node:path';
import { recordAudit } from '../audit/auditLog.js';

// call: the stored call (store.js); user: the admin deleting it; chat: mountChat's handle;
// recordingsDir: the recordings folder, or null without recording (no files then).
export function deleteCall(db, { chat, recordingsDir }, call, user) {
  const removed = db.transaction(() => {
    const recordingFiles = db
      .prepare('SELECT file FROM call_recordings WHERE call_id = ?')
      .all(call.id)
      .map((row) => row.file);
    // Before the call row: its room id is read from it, and the room is the call's alone.
    const room = call.chatRoomId ? chat.rooms.remove(call.chatRoomId) : null;
    db.prepare('DELETE FROM calls WHERE id = ?').run(call.id);
    recordAudit(db, user, {
      action: 'call.delete',
      targetType: 'call',
      targetId: call.id,
      before: { title: call.title },
    });
    return { recordingFiles, room };
  })();
  // Only after the commit: a deletion that failed leaves every file in place.
  if (recordingsDir) {
    for (const file of removed.recordingFiles) {
      rmSync(path.join(recordingsDir, file), { force: true });
    }
  }
  chat.rooms.afterRemove(removed.room);
}
