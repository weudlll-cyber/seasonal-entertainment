// ============================================================
// File:        readMarkers.js
// Path:        server/src/chat/readMarkers.js
// Project:     Seasonal Entertainment
// Description: How far a member has read, per room and per direct conversation (chat_reads),
//              and the unread counts that follow from it. One implementation for both kinds
//              (scope 'room' or 'direct'). A room's unread messages are the ones after the
//              marker that are not the member's own and not hidden; without a marker yet, only
//              messages written after the account was created count. A conversation's unread
//              messages are the partner's after the marker. Also which rooms a member muted.
// ============================================================

// Ids of the rooms the member muted (their unread messages stay out of the room total).
export function mutedRoomIds(db, userId) {
  return new Set(
    db
      .prepare('SELECT room_id AS id FROM chat_room_mutes WHERE user_id = ?')
      .all(userId)
      .map((r) => r.id)
  );
}

export function setRoomMuted(db, userId, roomId, muted) {
  if (muted) {
    db.prepare(
      'INSERT OR IGNORE INTO chat_room_mutes (user_id, room_id, created_at) VALUES (?, ?, ?)'
    ).run(userId, roomId, new Date().toISOString());
  } else {
    db.prepare('DELETE FROM chat_room_mutes WHERE user_id = ? AND room_id = ?').run(userId, roomId);
  }
}

// The member has read up to `lastId` (a marker never moves backwards).
export function markRead(db, userId, scope, targetId, lastId) {
  db.prepare(
    `INSERT INTO chat_reads (user_id, scope, target_id, last_read_id) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, scope, target_id) DO UPDATE
       SET last_read_id = MAX(last_read_id, excluded.last_read_id)`
  ).run(userId, scope, targetId, lastId);
}

const marker = (scope, target) =>
  `(SELECT last_read_id FROM chat_reads
    WHERE user_id = @me AND scope = '${scope}' AND target_id = ${target})`;

// { roomId: count } for the given rooms (those the member may read).
export function roomUnread(db, me, roomIds) {
  if (roomIds.length === 0) return {};
  const rows = db
    .prepare(
      `SELECT m.room_id AS roomId, COUNT(*) AS n FROM chat_messages m
       WHERE m.room_id IN (${roomIds.map(() => '?').join(',')})
         AND m.hidden_at IS NULL
         AND (m.author_user_id IS NULL OR m.author_user_id <> @me)
         AND m.id > COALESCE(${marker('room', 'm.room_id')}, 0)
         AND (${marker('room', 'm.room_id')} IS NOT NULL
              OR m.created_at > (SELECT created_at FROM users WHERE id = @me))
       GROUP BY m.room_id`
    )
    .all(...roomIds, { me });
  return Object.fromEntries(rows.map((r) => [r.roomId, r.n]));
}

// { roomId: count } of unread messages in the given rooms that mention the member (muted rooms
// included: mentions still notify there).
export function roomMentions(db, me, roomIds) {
  if (roomIds.length === 0) return {};
  const rows = db
    .prepare(
      `SELECT m.room_id AS roomId, COUNT(*) AS n
       FROM chat_mentions c JOIN chat_messages m ON m.id = c.message_id
       WHERE c.user_id = @me AND m.room_id IN (${roomIds.map(() => '?').join(',')})
         AND m.hidden_at IS NULL AND m.id > COALESCE(${marker('room', 'm.room_id')}, 0)
       GROUP BY m.room_id`
    )
    .all(...roomIds, { me });
  return Object.fromEntries(rows.map((r) => [r.roomId, r.n]));
}

// { partnerId: count } of messages from each partner after the member's marker.
export function directUnread(db, me) {
  const rows = db
    .prepare(
      `SELECT d.sender_id AS partnerId, COUNT(*) AS n FROM direct_messages d
       WHERE d.recipient_id = @me AND d.id > COALESCE(${marker('direct', 'd.sender_id')}, 0)
       GROUP BY d.sender_id`
    )
    .all({ me });
  return Object.fromEntries(rows.map((r) => [r.partnerId, r.n]));
}
