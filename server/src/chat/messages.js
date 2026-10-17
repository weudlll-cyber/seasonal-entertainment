// ============================================================
// File:        messages.js
// Path:        server/src/chat/messages.js
// Project:     Seasonal Entertainment
// Description: Data access for chat messages: text, sticker or GIF (a library item by id),
//              visible or hidden, with an optional link preview, and the reported-messages
//              list. A sticker/GIF whose item or pack is now inactive or deleted comes back with
//              media: null ("media removed"). A message with reports nobody has reviewed yet
//              shows its preview to moderators only.
// ============================================================

import { mediaUrl } from '../media/files.js';

const now = () => new Date().toISOString();

const MESSAGE_COLUMNS = `m.id, r.slug AS room, m.author_name AS author,
  (m.author_guest IS NOT NULL) AS isGuest, m.kind, m.body, m.created_at AS createdAt,
  m.hidden_at AS hiddenAt, m.hidden_by AS hiddenBy,
  i.file AS mediaFile, i.alt AS mediaAlt, i.credit AS mediaCredit, i.width AS mediaWidth,
  i.height AS mediaHeight,
  lp.url AS previewUrl, lp.title AS previewTitle, lp.description AS previewDescription,
  lp.site_name AS previewSite, lp.image_file AS previewImage, lp.image_width AS previewWidth,
  lp.image_height AS previewHeight,
  EXISTS (SELECT 1 FROM chat_reports c WHERE c.message_id = m.id AND c.reviewed_at IS NULL)
    AS reported`;
// Only an item that is active and in an active pack still shows.
const MESSAGE_FROM = `chat_messages m JOIN chat_rooms r ON r.id = m.room_id
  LEFT JOIN media_items i ON i.id = m.media_item_id AND i.active = 1
    AND EXISTS (SELECT 1 FROM media_packs p WHERE p.id = i.pack_id AND p.active = 1)
  LEFT JOIN link_previews lp ON lp.id = m.preview_id AND lp.ok = 1`;

function mediaOf(row) {
  if (row.kind === 'text' || !row.mediaFile) return null;
  const { mediaAlt: alt, mediaCredit: credit, mediaWidth: width, mediaHeight: height } = row;
  return { url: mediaUrl(row.mediaFile), alt, credit, width, height };
}

function previewOf(row) {
  if (!row.previewUrl) return null;
  const image = row.previewImage
    ? { url: mediaUrl(row.previewImage), width: row.previewWidth, height: row.previewHeight }
    : null;
  return {
    url: row.previewUrl,
    title: row.previewTitle,
    description: row.previewDescription,
    siteName: row.previewSite,
    image,
  };
}

// moderator: sees previews of reported messages (marked previewHeld); others do not.
function toMessage(row, moderator) {
  if (!row) return row;
  const message = {};
  for (const [key, value] of Object.entries(row)) {
    if (!/^(media|preview)[A-Z]/.test(key) && key !== 'reported') message[key] = value;
  }
  const preview = previewOf(row);
  const held = preview !== null && row.reported === 1;
  return {
    ...message,
    isGuest: row.isGuest === 1,
    media: mediaOf(row),
    preview: held && !moderator ? null : preview,
    ...(moderator && held && { previewHeld: true }),
  };
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

// As every reader sees it, plus the internal ids the server needs.
export function findMessage(db, id) {
  return toMessage(
    db
      .prepare(
        `SELECT ${MESSAGE_COLUMNS}, m.room_id AS roomId, m.author_user_id AS authorUserId,
                m.author_guest AS authorGuest
         FROM ${MESSAGE_FROM} WHERE m.id = ?`
      )
      .get(id),
    false
  );
}

// The newest `limit` messages, oldest first. Moderators also get hidden messages and the
// previews held back from reported ones.
export function listMessages(db, room, { moderator = false, limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT ${MESSAGE_COLUMNS} FROM ${MESSAGE_FROM}
         WHERE m.room_id = ? AND (? OR m.hidden_at IS NULL) ORDER BY m.id DESC LIMIT ?
       ) ORDER BY id`
    )
    .all(room.id, moderator ? 1 : 0, limit)
    .map((row) => toMessage(row, moderator));
}

export function hideMessage(db, id, moderator) {
  db.prepare('UPDATE chat_messages SET hidden_at = ?, hidden_by = ? WHERE id = ?').run(
    now(),
    moderator,
    id
  );
}

// Visible messages with reports nobody has reviewed yet (for moderators).
export function listReported(db) {
  return db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}, COUNT(c.id) AS reports
       FROM ${MESSAGE_FROM} JOIN chat_reports c ON c.message_id = m.id AND c.reviewed_at IS NULL
       WHERE m.hidden_at IS NULL GROUP BY m.id ORDER BY MAX(c.id) DESC`
    )
    .all()
    .map((row) => toMessage(row, true));
}
