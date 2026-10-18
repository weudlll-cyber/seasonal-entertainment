// ============================================================
// File:        readMarkers.js
// Path:        server/src/chat/readMarkers.js
// Project:     Seasonal Entertainment
// Description: How far a member has read, per room and per direct conversation (chat_reads),
//              and the unread counts that follow from it. One implementation for both kinds
//              (scope 'room' or 'direct'). A room's unread messages are the ones after the
//              marker that are not the member's own and not hidden; without a marker yet, only
//              messages written after the account was created count. A conversation's unread
//              messages are the partner's after the marker.
// ============================================================

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
