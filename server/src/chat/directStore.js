// ============================================================
// File:        directStore.js
// Path:        server/src/chat/directStore.js
// Project:     Seasonal Entertainment
// Description: Data access for direct messages between members. A message is stored as the
//              browser made it — nonce and ciphertext (crypto_box) — with who sent it to whom
//              and which key ids it was made with; the server cannot read it. Read markers
//              and unread counts: readMarkers.js.
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

// The newest `limit` messages between the two members, oldest first; with beforeId, the
// newest `limit` older than that id (paging back through the conversation).
export function listDirect(db, me, partner, { limit = 100, beforeId } = {}) {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT ${COLUMNS} FROM direct_messages
         WHERE ((sender_id = @me AND recipient_id = @partner)
            OR (sender_id = @partner AND recipient_id = @me))
           AND (@beforeId IS NULL OR id < @beforeId)
         ORDER BY id DESC LIMIT @limit)
       ORDER BY id`
    )
    .all({ me, partner, limit, beforeId: beforeId ?? null });
}

// Everyone the member has written with: the partner and the last message's time.
export function directConversations(db, me) {
  return db
    .prepare(
      `SELECT u.id, u.username, MAX(d.created_at) AS lastMessageAt
       FROM direct_messages d
       JOIN users u ON u.id = CASE WHEN d.sender_id = @me THEN d.recipient_id ELSE d.sender_id END
       WHERE d.sender_id = @me OR d.recipient_id = @me
       GROUP BY u.id`
    )
    .all({ me });
}
