// ============================================================
// File:        directStore.js
// Path:        server/src/chat/directStore.js
// Project:     Seasonal Entertainment
// Description: Data access for direct messages between members. A message is stored as the
//              browser made it — nonce and ciphertext (crypto_box) — with who sent it to whom
//              and which key ids it was made with; the server cannot read it. Also each
//              member's read marker per conversation, for the unread dot.
// ============================================================

const now = () => new Date().toISOString();

const COLUMNS = `id, sender_id AS senderId, recipient_id AS recipientId,
  sender_key_id AS senderKeyId, recipient_key_id AS recipientKeyId, nonce, ciphertext,
  created_at AS createdAt`;

export function addDirect(db, message) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO direct_messages
         (sender_id, recipient_id, sender_key_id, recipient_key_id, nonce, ciphertext, created_at)
       VALUES (@senderId, @recipientId, @senderKeyId, @recipientKeyId, @nonce, @ciphertext, @at)`
    )
    .run({ ...message, at: now() });
  return db.prepare(`SELECT ${COLUMNS} FROM direct_messages WHERE id = ?`).get(lastInsertRowid);
}

// The newest `limit` messages between the two members, oldest first.
export function listDirect(db, me, partner, limit = 100) {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT ${COLUMNS} FROM direct_messages
         WHERE (sender_id = @me AND recipient_id = @partner)
            OR (sender_id = @partner AND recipient_id = @me)
         ORDER BY id DESC LIMIT @limit)
       ORDER BY id`
    )
    .all({ me, partner, limit });
}

// Everyone the member has written with: the partner, the last message's time, and whether a
// message from them is newer than the member's read marker.
export function directConversations(db, me) {
  return db
    .prepare(
      `SELECT u.id, u.username, MAX(d.created_at) AS lastMessageAt,
         EXISTS (SELECT 1 FROM direct_messages n
                 WHERE n.sender_id = u.id AND n.recipient_id = @me
                   AND n.id > COALESCE((SELECT last_read_id FROM direct_reads
                                        WHERE user_id = @me AND partner_id = u.id), 0))
           AS unread
       FROM direct_messages d
       JOIN users u ON u.id = CASE WHEN d.sender_id = @me THEN d.recipient_id ELSE d.sender_id END
       WHERE d.sender_id = @me OR d.recipient_id = @me
       GROUP BY u.id`
    )
    .all({ me })
    .map((row) => ({ ...row, unread: row.unread === 1 }));
}

// The member has read the conversation up to `lastId` (never moves backwards).
export function markDirectRead(db, me, partner, lastId) {
  db.prepare(
    `INSERT INTO direct_reads (user_id, partner_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT (user_id, partner_id) DO UPDATE
       SET last_read_id = MAX(last_read_id, excluded.last_read_id)`
  ).run(me, partner, lastId);
}
