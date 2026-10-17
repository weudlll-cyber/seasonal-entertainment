// ============================================================
// File:        messages.js
// Path:        server/src/chat/messages.js
// Project:     Seasonal Entertainment
// Description: Data access for chat messages: text, sticker or GIF (a library item by id),
//              visible or hidden, and the reported-messages list. A sticker/GIF whose item or
//              pack is now inactive or deleted comes back with media: null ("media removed").
// ============================================================

import { mediaUrl } from '../media/files.js';

const now = () => new Date().toISOString();

const MESSAGE_COLUMNS = `m.id, r.slug AS room, m.author_name AS author,
  (m.author_guest IS NOT NULL) AS isGuest, m.kind, m.body, m.created_at AS createdAt,
  m.hidden_at AS hiddenAt, m.hidden_by AS hiddenBy,
  i.file AS mediaFile, i.alt AS mediaAlt, i.credit AS mediaCredit, i.width AS mediaWidth,
  i.height AS mediaHeight`;
// Only an item that is active and in an active pack still shows.
const MESSAGE_FROM = `chat_messages m JOIN chat_rooms r ON r.id = m.room_id
  LEFT JOIN media_items i ON i.id = m.media_item_id AND i.active = 1
    AND EXISTS (SELECT 1 FROM media_packs p WHERE p.id = i.pack_id AND p.active = 1)`;

function toMessage(row) {
  if (!row) return row;
  const { mediaFile, mediaAlt, mediaCredit, mediaWidth, mediaHeight, ...message } = row;
  const media =
    message.kind === 'text' || !mediaFile
      ? null
      : {
          url: mediaUrl(mediaFile),
          alt: mediaAlt,
          credit: mediaCredit,
          width: mediaWidth,
          height: mediaHeight,
        };
  return { ...message, isGuest: message.isGuest === 1, media };
}

// input: { kind: 'text', body } or { kind: 'sticker' | 'gif', itemId }.
export function addMessage(db, room, { user, guest }, { kind, body = '', itemId = null }) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO chat_messages
         (room_id, author_user_id, author_guest, author_name, kind, body, media_item_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      room.id,
      user?.id ?? null,
      guest?.id ?? null,
      user?.username ?? guest.name,
      kind,
      body,
      itemId,
      now()
    );
  return findMessage(db, Number(lastInsertRowid));
}

export function findMessage(db, id) {
  return toMessage(
    db
      .prepare(
        `SELECT ${MESSAGE_COLUMNS}, m.room_id AS roomId, m.author_user_id AS authorUserId,
                m.author_guest AS authorGuest
         FROM ${MESSAGE_FROM} WHERE m.id = ?`
      )
      .get(id)
  );
}

// The newest `limit` messages, oldest first. Hidden ones only for moderators.
export function listMessages(db, room, { includeHidden = false, limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM}
         WHERE m.room_id = ? AND (? OR m.hidden_at IS NULL) ORDER BY m.id DESC LIMIT ?
       ) ORDER BY id`
    )
    .all(room.id, includeHidden ? 1 : 0, limit)
    .map(toMessage);
}

export function hideMessage(db, id, moderator) {
  db.prepare('UPDATE chat_messages SET hidden_at = ?, hidden_by = ? WHERE id = ?').run(
    now(),
    moderator,
    id
  );
}

export function listReported(db) {
  return db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}, COUNT(c.id) AS reports
       FROM ${MESSAGE_FROM} JOIN chat_reports c ON c.message_id = m.id
       WHERE m.hidden_at IS NULL GROUP BY m.id ORDER BY MAX(c.id) DESC`
    )
    .all()
    .map(toMessage);
}
